// Headless validation for Maid: rules that look at entities and their neighbours, and a validator
// that keeps what they found. No map, no React, no DOM.

import { almostJunction } from './rules/almost-junction.ts'
import { boundaryNotClosed } from './rules/boundary-not-closed.ts'
import { crossingWays } from './rules/crossing-ways.ts'
import { disconnectedWay } from './rules/disconnected-way.ts'
import { impossibleOneway } from './rules/impossible-oneway.ts'
import { incompatibleSource } from './rules/incompatible-source.ts'
import { invalidFormat } from './rules/invalid-format.ts'
import { missingRole } from './rules/missing-role.ts'
import { missingTag } from './rules/missing-tag.ts'
import { multipolygonCrossing } from './rules/multipolygon-crossing.ts'
import { mutuallyExclusiveTags } from './rules/mutually-exclusive-tags.ts'
import { osmApiLimits } from './rules/osm-api-limits.ts'
import { outdatedTags } from './rules/outdated-tags.ts'
import { privateData } from './rules/private-data.ts'
import { relationMembers } from './rules/relation-members.ts'
import { relationSelfMember } from './rules/relation-self-member.ts'
import { restrictionBroken } from './rules/restriction-broken.ts'
import { routeGap } from './rules/route-gap.ts'
import type { Rule } from './types.ts'

export { createValidator } from './validator.ts'
export type { ValidatorOptions } from './validator.ts'
export { neighbourhoodOf, ON_DEMAND_MEMBER_CAP } from './neighbourhood.ts'
export type { Neighbourhood } from './neighbourhood.ts'
export { compareSharedIssues, sharedIssues } from './shared-issues.ts'
export { applyOverrides, parseOverrides, subtypeOf } from './overrides.ts'
export type { OverrideParams, OverrideRule, Overrides } from './overrides.ts'
export { missingTag } from './rules/missing-tag.ts'
export { disconnectedWay } from './rules/disconnected-way.ts'
export { crossingWays } from './rules/crossing-ways.ts'
export { almostJunction } from './rules/almost-junction.ts'
export { impossibleOneway } from './rules/impossible-oneway.ts'
export { incompatibleSource, incompatibleSourceMentions } from './rules/incompatible-source.ts'
export type { IncompatibleMention } from './rules/incompatible-source.ts'
export { invalidFormat } from './rules/invalid-format.ts'
export { missingRole } from './rules/missing-role.ts'
export { multipolygonCrossing } from './rules/multipolygon-crossing.ts'
export { mutuallyExclusiveTags } from './rules/mutually-exclusive-tags.ts'
export { MISSING_LEVEL_RULE_ID, missingLevel } from './rules/missing-level.ts'
export { stairsLevelMissing, stairsLevelUnreached } from './rules/stairs-level.ts'
export { outdatedTags, tagDiffOf, upgradeTags } from './rules/outdated-tags.ts'
export type { TagDiff } from './rules/outdated-tags.ts'
export { osmApiLimits } from './rules/osm-api-limits.ts'
export { privateData } from './rules/private-data.ts'
export { boundaryNotClosed } from './rules/boundary-not-closed.ts'
export { restrictionBroken } from './rules/restriction-broken.ts'
export { routeGap, routeJoins } from './rules/route-gap.ts'
export { relationMembers } from './rules/relation-members.ts'
export { relationSelfMember } from './rules/relation-self-member.ts'
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
  // needs the presets (the validator's `presets` option): nothing until they are made
  outdatedTags,
  mutuallyExclusiveTags,
  incompatibleSource,
  privateData,
  missingRole,
  // the duplicate members of a relation whose schema allows none: needs the presets, as outdatedTags
  relationMembers,
  // a relation as its own member, directly or through sub relations
  relationSelfMember,
  // the rings of a multipolygon that cross: a warning at the place, no fix
  multipolygonCrossing,
  // a route whose consecutive ways do not join: a warning at the gap, no fix
  routeGap,
  // a boundary whose outer ways do not close: a warning at the open end, no fix
  boundaryNotClosed,
  // a turn restriction whose from or to way does not touch the via: a fix only when a from or to way was deleted
  restrictionBroken,
  osmApiLimits,
]

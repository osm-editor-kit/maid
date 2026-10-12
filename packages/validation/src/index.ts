// Headless validation for Maid: rules that look at entities and their neighbours, and a validator
// that keeps what they found. No map, no React, no DOM.
import { crossingWays } from './rules/crossing-ways.ts'
import { disconnectedWay } from './rules/disconnected-way.ts'
import { missingTag } from './rules/missing-tag.ts'
import type { Rule } from './types.ts'

export { createValidator } from './validator.ts'
export { missingTag } from './rules/missing-tag.ts'
export { disconnectedWay } from './rules/disconnected-way.ts'
export { crossingWays } from './rules/crossing-ways.ts'
export type * from './types.ts'

/** The rules Maid runs unless a caller passes its own */
export const defaultRules: Rule[] = [missingTag, disconnectedWay, crossingWays]

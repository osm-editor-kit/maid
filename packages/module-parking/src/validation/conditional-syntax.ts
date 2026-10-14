import type { Issue, Rule } from '@osm-editor-kit/maid-validation'
import { m } from '../messages.ts'
import { splitOutsideParens } from '../restriction/conditional.ts'
import { featureName, isParkingConditionalKey, issueFor } from './shared.ts'

export const RULE_ID = 'parking_conditional_syntax'

/** Whether every opening parenthesis is closed, and none is closed before it is opened */
function parenthesesBalanced(value: string) {
  let depth = 0
  for (const ch of value) {
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth < 0) return false
    }
  }
  return depth === 0
}

/**
 * A conditional value is `value @ (condition)`, with stacked conditions separated by `;` (project-decisions D15;
 * qa-markings-obstacles-process.md 5.4 rule 13: accept the OSM syntax, not JOSM's stricter one). So this is the
 * lenient check: every part has an `@`, and the parentheses balance. A value that always holds (`no_stopping` with no
 * condition) is not a conditional and is reported. No fix.
 */
export function isConditionValue(value: string) {
  if (!parenthesesBalanced(value)) return false
  const parts = splitOutsideParens(value, ';').filter((part) => part.trim() !== '')
  return parts.length > 0 && parts.every((part) => part.includes('@'))
}

export const conditionalSyntax: Rule = {
  id: RULE_ID,
  get label() {
    return m.valid_conditional_label()
  },
  validate(entity) {
    const tags = entity.tags
    const feature = featureName(tags)
    const issues: Issue[] = []
    for (const key of Object.keys(tags)) {
      if (!isParkingConditionalKey(key, tags)) continue
      const value = tags[key]
      if (value === undefined || isConditionValue(value)) continue
      issues.push(
        issueFor({
          rule: RULE_ID,
          entity,
          part: `:${key}`,
          tags: `${key}=${value}`,
          message: m.valid_conditional_message({ feature, tags: `${key}=${value}` }),
          fixes: [],
        }),
      )
    }
    return issues
  },
}

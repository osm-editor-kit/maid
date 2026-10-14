import type { Issue, Rule } from '@osm-editor-kit/maid-validation'
import { m } from '../messages.ts'
import { featureName, isParkingConditionalKey, issueFor, tagsFix } from './shared.ts'

export const RULE_ID = 'parking_weekday_comma'

const DAY = '(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?'
/**
 * A comma that follows a time and starts a new weekday group with its times: `16:00, Sa 07:00`. Days listed
 * with commas (`Mo,We 08:00`) are not matched: their comma follows a letter, not a time.
 */
const GROUP_COMMA = `(?<=\\d),(\\s*)(?=${DAY}\\s+\\d)`

/** The value with each comma between weekday groups replaced by `;` (the Q&A's correction, qa-traffic-signs entry 2) */
export function semicolonBetweenGroups(value: string) {
  return value.replace(new RegExp(GROUP_COMMA, 'g'), ';$1')
}

/**
 * A comma between weekday groups in a conditional value (`Mo-Fr 06:00-16:00, Sa 07:00-16:00`), where
 * the Q&A decided `;` (qa-traffic-signs 4.4, V6). Fix: replace the commas.
 */
export const weekdayComma: Rule = {
  id: RULE_ID,
  get label() {
    return m.valid_weekday_label()
  },
  validate(entity) {
    const tags = entity.tags
    const feature = featureName(tags)
    const test = new RegExp(GROUP_COMMA)
    const issues: Issue[] = []
    for (const key of Object.keys(tags)) {
      const value = tags[key]
      if (!isParkingConditionalKey(key, tags) || value === undefined || !test.test(value)) continue
      issues.push(
        issueFor({
          rule: RULE_ID,
          entity,
          part: `:${key}`,
          tags: `${key}=${value}`,
          message: m.valid_weekday_message({ feature, tags: `${key}=${value}` }),
          fixes: [
            tagsFix({
              entityId: entity.id,
              id: 'semicolon_between_groups',
              label: m.valid_fix_semicolon_label(),
              annotation: m.valid_fix_semicolon_annotation({ key }),
              change: (current) => ({
                ...current,
                [key]: semicolonBetweenGroups(current[key] ?? ''),
              }),
            }),
          ],
        }),
      )
    }
    return issues
  },
}

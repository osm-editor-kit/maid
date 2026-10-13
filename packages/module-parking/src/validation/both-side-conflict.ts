import type { Issue, Rule } from '@osm-editor-kit/maid-validation'
import { featureName, issueFor, tagsFix, type Tags } from './shared.ts'

export const RULE_ID = 'parking_both_conflicts_side'

/**
 * The `both` value of a suffix split into the two sides, as the editor's own writes do it: a side with its
 * own value keeps it, a side without one gets the `both` value, and the `both` key goes.
 */
export function splitBoth(tags: Tags, suffix: string): Record<string, string> {
  const next: Record<string, string> = { ...tags }
  const both = tags[`parking:both${suffix}`]
  delete next[`parking:both${suffix}`]
  if (both) {
    for (const side of ['left', 'right'] as const) {
      const key = `parking:${side}${suffix}`
      if (!tags[key]) next[key] = both
    }
  }
  return next
}

/**
 * `parking:both:<suffix>` together with `parking:left:<suffix>` or `parking:right:<suffix>` (the bare key
 * counts as a suffix too). Not from the project's documents: it holds for OpenStreetMap in general, where one of the
 * two then says something else than the other, or the same thing twice. Maid reads the side's own key first, and the
 * fix writes that reading down: split both (splitBoth).
 * The inspector's side fields write this pair themselves when several roads are changed at once (they then write only
 * the side's key, packages/ui directional-logic.ts `sideOnlyWrite`), so the rule also catches those.
 */
export const bothConflictsSide: Rule = {
  id: RULE_ID,
  label: 'Both sides and one side of the same tag',
  validate(entity) {
    const tags = entity.tags
    const feature = featureName(tags)
    const suffixes = new Set<string>()
    for (const key of Object.keys(tags)) {
      const match = /^parking:both(:.+)?$/.exec(key)
      if (match) suffixes.add(match[1] ?? '')
    }
    const issues: Issue[] = []
    for (const suffix of suffixes) {
      const bothKey = `parking:both${suffix}`
      const sideKeys = (['left', 'right'] as const)
        .map((side) => `parking:${side}${suffix}`)
        .filter((key) => tags[key])
      if (!tags[bothKey] || sideKeys.length === 0) continue
      const described = [bothKey, ...sideKeys].map((key) => `${key}=${tags[key]}`).join(', ')
      issues.push(
        issueFor({
          rule: RULE_ID,
          entity,
          part: `:both${suffix}`,
          feature,
          tags: described,
          message: `${feature} has ${described}: the value is given for both sides and for one side at once`,
          fixes: [
            tagsFix({
              entityId: entity.id,
              id: 'split_both',
              label: `Split ${bothKey} into the two sides`,
              annotation: `Split ${bothKey} into the two sides`,
              subject: bothKey,
              change: (current) => splitBoth(current, suffix),
            }),
          ],
        }),
      )
    }
    return issues
  },
}

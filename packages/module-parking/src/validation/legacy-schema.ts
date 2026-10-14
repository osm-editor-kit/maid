import type { Issue, Rule } from '@osm-editor-kit/maid-validation'
import { m } from '../messages.ts'
import { featureName, issueFor } from './shared.ts'

export const RULE_ID = 'parking_legacy_schema'

const LEGACY_PREFIXES = ['parking:lane:', 'parking:condition:']

/**
 * Keys of the parking schema from before 2022 (`parking:lane:*`, `parking:condition:*`). Not from the project's
 * documents: it holds for OpenStreetMap in general. The old keys are still common in the data, and readers of the
 * current schema (`parking:left|right|both`) do not see them, so a mapper who edits such a road is told. A warning,
 * and no fix: the old values do not map one to one to the current keys, so nothing is converted automatically.
 */
export const legacySchema: Rule = {
  id: RULE_ID,
  get label() {
    return m.valid_legacy_label()
  },
  validate(entity) {
    const tags = entity.tags
    const keys = Object.keys(tags)
      .filter((key) => LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .sort()
    if (keys.length === 0) return []
    const feature = featureName(tags)
    const described = keys.map((key) => `${key}=${tags[key]}`).join(', ')
    const issue: Issue = issueFor({
      rule: RULE_ID,
      entity,
      tags: described,
      message: m.valid_legacy_message({ feature, tags: described }),
      fixes: [],
    })
    return [issue]
  },
}

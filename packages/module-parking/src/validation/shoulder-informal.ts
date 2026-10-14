import type { Issue, Rule } from '@osm-editor-kit/maid-validation'
import { m } from '../messages.ts'
import { applyEdits, readSide, sideKey, writeSide, type Side } from '../sides.ts'
import { featureName, issueFor, tagsFix } from './shared.ts'

export const RULE_ID = 'parking_shoulder_without_informal'

/**
 * `parking:<side>=shoulder` without `parking:<side>:informal=yes` (project-decisions D12; qa-markings S24).
 * A shoulder is unlawful but tolerated parking, so the informal flag is added. A paved shoulder is
 * `street_side` (S31), not a shoulder.
 */
export const shoulderWithoutInformal: Rule = {
  id: RULE_ID,
  get label() {
    return m.valid_shoulder_label()
  },
  validate(entity) {
    const tags = entity.tags
    const feature = featureName(tags)
    // The side that holds the shoulder value: its own key, or `both` when the value comes from there
    const sources = new Set<Side>()
    for (const side of ['left', 'right'] as const) {
      if (readSide(tags, side) === 'shoulder') sources.add(tags[sideKey(side)] ? side : 'both')
    }
    const issues: Issue[] = []
    for (const source of sources) {
      if (readSide(tags, source, 'informal') === 'yes') continue
      const parkingKey = sideKey(source)
      const informalKey = sideKey(source, 'informal')
      issues.push(
        issueFor({
          rule: RULE_ID,
          entity,
          part: `:${source}`,
          tags: `${parkingKey}=shoulder`,
          message: m.valid_shoulder_message({ feature, tags: `${parkingKey}=shoulder` }),
          fixes: [
            tagsFix({
              entityId: entity.id,
              id: 'add_informal',
              label: m.valid_fix_add_informal_label({ key: informalKey }),
              annotation: m.valid_fix_add_informal_annotation({ key: informalKey }),
              change: (current) =>
                applyEdits(current, writeSide(current, source, 'informal', 'yes')),
            }),
          ],
        }),
      )
    }
    return issues
  },
}

import type { Issue, Rule } from '@osm-editor-kit/maid-validation'
import { m } from '../messages.ts'
import { parseSideKey, readSide } from '../sides.ts'
import { featureName, issueFor, sourceKey, type Tags } from './shared.ts'

export const RULE_ID = 'parking_restriction_on_parking_side'

/** Parking on the carriageway, in a bay or on the kerb of its side */
const PARKING_POSITIONS = new Set(['lane', 'street_side', 'on_kerb', 'half_on_kerb', 'shoulder'])

/** Restrictions that forbid parking on their side when they are not conditional */
const FORBIDS_PARKING = new Set(['no_parking', 'no_stopping'])

/**
 * Whether a side exempts a vehicle class from its restriction: `parking:<side>:restriction:taxi=none`. A taxi stand
 * is a lane with no stopping and that exemption (qa-markings-obstacles-process.md S15), which is not a contradiction.
 */
function hasExemption(tags: Tags, side: 'left' | 'right') {
  return Object.keys(tags).some((key) => {
    const parsed = parseSideKey(key)
    if (!parsed || (parsed.side !== side && parsed.side !== 'both')) return false
    const rest = parsed.suffix?.match(/^restriction:(.+)$/)?.[1]
    return rest !== undefined && rest !== 'conditional' && !rest.startsWith('reason')
  })
}

/**
 * Parking on a side, and an unconditional `parking:<side>:restriction` of no_parking or no_stopping on the same side
 * (qa-traffic-signs.md V4 and R17: never `lane` with `no_parking` on the same side; the other positions and
 * no_stopping are the same contradiction). Not reported: the conditional form (`:restriction:conditional`), which is a
 * time limit, and a side that exempts a vehicle class (hasExemption). No fix: which of the two is right is the sign's
 * decision; the documents suggest `no` with the restriction, or a separate area.
 */
export const restrictionOnParkingSide: Rule = {
  id: RULE_ID,
  get label() {
    return m.valid_restriction_side_label()
  },
  validate(entity) {
    const tags = entity.tags
    const feature = featureName(tags)
    const issues: Issue[] = []
    for (const side of ['left', 'right'] as const) {
      const parking = readSide(tags, side)
      const restriction = readSide(tags, side, 'restriction')
      if (!parking || !PARKING_POSITIONS.has(parking)) continue
      if (!restriction || !FORBIDS_PARKING.has(restriction) || hasExemption(tags, side)) continue
      const parkingKey = sourceKey(tags, side)
      const restrictionKey = sourceKey(tags, side, 'restriction')
      const described = `${parkingKey}=${parking}, ${restrictionKey}=${restriction}`
      issues.push(
        issueFor({
          rule: RULE_ID,
          entity,
          part: `:${side}`,
          tags: described,
          message: m.valid_restriction_side_message({ feature, tags: described }),
          fixes: [],
        }),
      )
    }
    return issues
  },
}

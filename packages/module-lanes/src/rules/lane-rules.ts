/**
 * Lane rules for the Issues dock: the findings of osm-lanes' `validateWayLanes` on roads, as Maid rules with texts in the
 * page's language. One rule per finding, so the dock can list and filter them by name. Left out on purpose:
 * `bike_lanes_count_inconsistency`, which flags the German pattern (a cycle lane in the pipes, not in `lanes`), a valid
 * way to tag. For the same reason a direction whose extra pipe entries are all cycle lanes is not a count mismatch.
 */
import { actionChangeTags } from '@osm-editor-kit/maid-model'
import type { Fix, Issue, Rule } from '@osm-editor-kit/maid-validation'
import { isOneway, parseWayLanes, type LaneSlot, type LaneWarning } from '@osm-editor-kit/osm-lanes'
import { m } from '../messages.ts'
import { isLaneRoad } from '../roads.ts'

type Entity = Parameters<Rule['validate']>[0]
type Tags = Readonly<Record<string, string>>

export const LANE_RULE_IDS = {
  sum: 'lanes_sum_mismatch',
  count: 'lanes_pipe_count_mismatch',
  length: 'lanes_pipe_length_mismatch',
  placement: 'lanes_placement_out_of_range',
} as const

/** The road for the issue text: its name with its highway tag */
function featureName(tags: Tags): string {
  const kind = `highway=${tags.highway ?? '?'}`
  return tags.name ? `${tags.name} (${kind})` : kind
}

function isBikeSlot(slot: LaneSlot): boolean {
  const bike = slot.bicycleAccess?.toLowerCase()
  return bike === 'designated' || bike === 'yes' || slot.kind === 'bicycle'
}

/** The warnings of one code on a lane road, with the model they came from. Memoised per tags object. */
const cache = new WeakMap<
  object,
  { model: ReturnType<typeof parseWayLanes>; warnings: LaneWarning[] }
>()
function findings(entity: Entity) {
  if (entity.type !== 'way' || !isLaneRoad(entity.tags)) return undefined
  const known = cache.get(entity.tags)
  if (known) return known
  const model = parseWayLanes({ ...entity.tags })
  const found = { model, warnings: model.warnings }
  cache.set(entity.tags, found)
  return found
}

function issue(
  rule: string,
  entity: Entity,
  part: string,
  severity: Issue['severity'],
  message: string,
  fixes: Fix[] = [],
): Issue {
  return {
    id: `${rule}:${entity.id}${part}`,
    rule,
    severity,
    message,
    entityIds: [entity.id],
    fixes,
  }
}

/** `lanes` is not the sum of `lanes:forward`, `lanes:backward` and `lanes:both_ways`. Fix: `lanes` takes the sum. */
export const lanesSumMismatch: Rule = {
  id: LANE_RULE_IDS.sum,
  get label() {
    return m.rule_sum_label()
  },
  validate(entity) {
    const found = findings(entity)
    if (!found?.warnings.some((w) => w.code === 'lanes_sum_mismatch')) return []
    const { model } = found
    const sum = (model.lanesForward ?? 0) + (model.lanesBackward ?? 0) + (model.lanesBothWays ?? 0)
    const fix: Fix = {
      id: 'set_lanes_to_sum',
      label: m.rule_sum_fix({ sum: String(sum) }),
      annotation: m.rule_sum_fix_done(),
      actions: (graph) => {
        const now = graph.hasEntity(entity.id)
        return now ? [actionChangeTags(entity.id, { ...now.tags, lanes: String(sum) })] : []
      },
    }
    return [
      issue(
        LANE_RULE_IDS.sum,
        entity,
        '',
        'error',
        m.rule_sum_message({
          feature: featureName(entity.tags),
          total: String(model.lanesTotal ?? ''),
          sum: String(sum),
        }),
        [fix],
      ),
    ]
  },
}

/** `lanes:<direction>` and the number of entries in that direction's `*:lanes` keys differ, cycle lanes aside */
export const lanesPipeCountMismatch: Rule = {
  id: LANE_RULE_IDS.count,
  get label() {
    return m.rule_count_label()
  },
  validate(entity) {
    const found = findings(entity)
    if (!found) return []
    const issues: Issue[] = []
    for (const warning of found.warnings) {
      if (warning.code !== 'pipe_count_mismatch') continue
      const match = /^lanes:(\w+)=(\d+) but (\d+) pipe/.exec(warning.message)
      if (!match) continue
      const [, direction = '', declared = '', count = ''] = match
      const slots = found.model.slots.filter((slot) => slot.direction === direction)
      const bikes = slots.filter(isBikeSlot).length
      // the German pattern: the extra entries are cycle lanes, which `lanes` leaves out
      if (Number(count) > Number(declared) && Number(count) - bikes <= Number(declared)) continue
      issues.push(
        issue(
          LANE_RULE_IDS.count,
          entity,
          `:${direction}`,
          'warning',
          m.rule_count_message({
            feature: featureName(entity.tags),
            key: isOneway({ ...entity.tags }) ? 'lanes' : `lanes:${direction}`,
            declared,
            count,
          }),
        ),
      )
    }
    return issues
  },
}

/** Two `*:lanes` keys of one direction have different numbers of entries (`turn:lanes` 3, `width:lanes` 2) */
export const lanesPipeLengthMismatch: Rule = {
  id: LANE_RULE_IDS.length,
  get label() {
    return m.rule_length_label()
  },
  validate(entity) {
    const found = findings(entity)
    if (!found) return []
    const issues: Issue[] = []
    for (const warning of found.warnings) {
      if (warning.code !== 'pipe_length_mismatch') continue
      const match = /^(\S+) \((\d+)\) and (\S+) \((\d+)\) differ for (\w+)$/.exec(warning.message)
      if (!match) continue
      const [, first = '', firstCount = '', second = '', secondCount = '', direction = ''] = match
      issues.push(
        issue(
          LANE_RULE_IDS.length,
          entity,
          `:${direction}:${second}`,
          'warning',
          m.rule_length_message({
            feature: featureName(entity.tags),
            first,
            firstCount,
            second,
            secondCount,
          }),
        ),
      )
    }
    return issues
  },
}

/** `placement=*` names a lane the road does not have */
export const lanesPlacementOutOfRange: Rule = {
  id: LANE_RULE_IDS.placement,
  get label() {
    return m.rule_placement_label()
  },
  validate(entity) {
    const found = findings(entity)
    if (!found) return []
    const issues: Issue[] = []
    for (const warning of found.warnings) {
      if (warning.code !== 'placement_out_of_range') continue
      const match = /^(\S+)=(\S+) references lane \d+ but \w+ has (\d+) slot/.exec(warning.message)
      if (!match) continue
      const [, key = '', value = '', count = ''] = match
      issues.push(
        issue(
          LANE_RULE_IDS.placement,
          entity,
          `:${key}`,
          'warning',
          m.rule_placement_message({
            feature: featureName(entity.tags),
            tag: `${key}=${value}`,
            count,
          }),
        ),
      )
    }
    return issues
  },
}

export const laneRules: Rule[] = [
  lanesSumMismatch,
  lanesPipeCountMismatch,
  lanesPipeLengthMismatch,
  lanesPlacementOutOfRange,
]

/**
 * Lane rules on the values themselves: a `turn:lanes` value the wiki does not know, a deprecated `change:lanes` value,
 * and a `width` narrower than what its lanes add up to. Adopted from Lane Studio's `lane_tags` validator
 * (https://github.com/MarcelMarzec/LaneStudio, `modules/lanes/validations/lane_tags.ts` and
 * `modules/lanes/model/values.ts`, ISC licence, © Lane Studio contributors): the list of turn values, the
 * misspellings it fixes in one click and the deprecated change values. The width check reads osm-lanes'
 * `reconcileWidths`, so on-street parking and cycle lane buffers count too. Comparison and what was left out:
 * docs/research/lane-studio-comparison.md.
 */
import { actionChangeTags } from '@osm-editor-kit/maid-model'
import type { Fix, Issue, Rule } from '@osm-editor-kit/maid-validation'
import { reconcileWidths } from '@osm-editor-kit/osm-lanes'
import { m } from '../messages.ts'
import { isLaneRoad } from '../roads.ts'

type Entity = Parameters<Rule['validate']>[0]
type Tags = Readonly<Record<string, string>>

export const VALUE_RULE_IDS = {
  unknownTurn: 'lanes_unknown_turn',
  deprecatedChange: 'lanes_deprecated_change',
  widthTooNarrow: 'lanes_width_too_narrow',
} as const

/** `turn` values of the wiki (Key:turn), as Lane Studio lists them */
export const TURN_VALUES: ReadonlySet<string> = new Set([
  'sharp_left',
  'left',
  'slight_left',
  'through',
  'slight_right',
  'right',
  'sharp_right',
  'reverse',
  'merge_to_left',
  'merge_to_right',
  'slide_left',
  'slide_right',
  'next_left',
  'next_right',
  'none',
])

/** Misspellings of `turn` values with one meaning, and the value they mean (Lane Studio's `turnSynonyms`) */
export const TURN_SYNONYMS: Readonly<Record<string, string>> = {
  straight: 'through',
  straight_on: 'through',
  ahead: 'through',
  u_turn: 'reverse',
  uturn: 'reverse',
  'u-turn': 'reverse',
  slightleft: 'slight_left',
  slightright: 'slight_right',
  sharpleft: 'sharp_left',
  sharpright: 'sharp_right',
}

/** Deprecated `change` values and their replacements (wiki: Key:change) */
export const CHANGE_REPLACEMENTS: Readonly<Record<string, string>> = {
  only_left: 'not_right',
  only_right: 'not_left',
}

/** Slack for widths: decimals written as 3.25 and 3.3 should not trip the check */
const WIDTH_TOLERANCE_M = 0.05

const TURN_KEY = /^turn:lanes(?::(?:forward|backward|both_ways))?$/
const CHANGE_KEY = /^change(?::lanes)?(?::(?:forward|backward|both_ways))?$/

/** The road for the issue text: its name with its highway tag */
function featureName(tags: Tags): string {
  const kind = `highway=${tags.highway ?? '?'}`
  return tags.name ? `${tags.name} (${kind})` : kind
}

function laneWay(entity: Entity): boolean {
  return entity.type === 'way' && isLaneRoad(entity.tags)
}

/** The values of a key, one per lane, each split at `;` (`left;through|right` → `left`, `through`, `right`) */
function valuesOf(value: string): string[] {
  return value
    .split('|')
    .flatMap((lane) => lane.split(';'))
    .map((v) => v.trim())
    .filter(Boolean)
}

/** Every key matching `pattern` with `from` replaced by `to` in each of its `|` and `;` parts */
function replaceValue(
  tags: Tags,
  pattern: RegExp,
  from: string,
  to: string,
): Record<string, string> {
  const next: Record<string, string> = { ...tags }
  for (const [key, value] of Object.entries(tags)) {
    if (!pattern.test(key)) continue
    next[key] = value
      .split('|')
      .map((lane) =>
        lane
          .split(';')
          .map((v) => (v.trim() === from ? to : v))
          .join(';'),
      )
      .join('|')
  }
  return next
}

function replaceFix(entity: Entity, pattern: RegExp, from: string, to: string): Fix {
  return {
    id: `replace_${from}`,
    label: m.rule_value_fix({ value: from, replacement: to }),
    annotation: m.rule_value_fix_done({ value: from, replacement: to }),
    actions: (graph) => {
      const now = graph.hasEntity(entity.id)
      return now ? [actionChangeTags(entity.id, replaceValue(now.tags, pattern, from, to))] : []
    },
  }
}

/** The distinct values of the keys matching `pattern`, in the order they first appear */
function distinctValues(tags: Tags, pattern: RegExp): string[] {
  const found = new Set<string>()
  for (const [key, value] of Object.entries(tags)) {
    if (pattern.test(key)) for (const v of valuesOf(value)) found.add(v)
  }
  return [...found]
}

function issue(
  rule: string,
  entity: Entity,
  part: string,
  message: string,
  fixes: Fix[] = [],
): Issue {
  return {
    id: `${rule}:${entity.id}${part}`,
    rule,
    severity: 'warning',
    message,
    entityIds: [entity.id],
    fixes,
  }
}

/** A `turn:lanes` value the wiki does not know. Fix: the value it means, where that is certain. */
export const lanesUnknownTurn: Rule = {
  id: VALUE_RULE_IDS.unknownTurn,
  get label() {
    return m.rule_turn_label()
  },
  validate(entity) {
    if (!laneWay(entity)) return []
    return distinctValues(entity.tags, TURN_KEY)
      .filter((value) => !TURN_VALUES.has(value))
      .map((value) => {
        const replacement = TURN_SYNONYMS[value]
        return issue(
          VALUE_RULE_IDS.unknownTurn,
          entity,
          `:${value}`,
          m.rule_turn_message({ feature: featureName(entity.tags), value }),
          replacement ? [replaceFix(entity, TURN_KEY, value, replacement)] : [],
        )
      })
  },
}

/** A deprecated `change` value (`only_left`, `only_right`). Fix: its replacement. */
export const lanesDeprecatedChange: Rule = {
  id: VALUE_RULE_IDS.deprecatedChange,
  get label() {
    return m.rule_change_label()
  },
  validate(entity) {
    if (!laneWay(entity)) return []
    return distinctValues(entity.tags, CHANGE_KEY)
      .filter((value) => value in CHANGE_REPLACEMENTS)
      .map((value) => {
        const replacement = CHANGE_REPLACEMENTS[value] ?? value
        return issue(
          VALUE_RULE_IDS.deprecatedChange,
          entity,
          `:${value}`,
          m.rule_change_message({ feature: featureName(entity.tags), value, replacement }),
          [replaceFix(entity, CHANGE_KEY, value, replacement)],
        )
      })
  },
}

/**
 * `width` (kerb to kerb, wiki: Key:width) is narrower than `width:lanes`, on-street parking and cycle lane buffers
 * add up to. Only against `width`, not `est_width`, which is an estimate. No fix: either value can be the wrong one.
 */
export const lanesWidthTooNarrow: Rule = {
  id: VALUE_RULE_IDS.widthTooNarrow,
  get label() {
    return m.rule_width_label()
  },
  validate(entity) {
    if (!laneWay(entity)) return []
    const found = reconcileWidths({ ...entity.tags })
    if (found.widthSource !== 'width' || found.widthM == null || found.slotSumM === undefined)
      return []
    const parts = found.slotSumM + found.parkingM + found.bufferM
    if (parts <= found.widthM + WIDTH_TOLERANCE_M) return []
    return [
      issue(
        VALUE_RULE_IDS.widthTooNarrow,
        entity,
        '',
        m.rule_width_message({
          feature: featureName(entity.tags),
          width: String(found.widthM),
          sum: String(Math.round(parts * 100) / 100),
        }),
      ),
    ]
  },
}

export const valueRules: Rule[] = [lanesUnknownTurn, lanesDeprecatedChange, lanesWidthTooNarrow]

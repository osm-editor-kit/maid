/**
 * Pure helpers of the inspector's level section (LevelSection.tsx): the two ends of a connector (steps, a ramp, an
 * escalator) in its way's direction, and the tag values that write them.
 */
import { levelsOf } from '@osm-editor-kit/maid-levels'
import { inclineOf, type LevelSuggestion } from './level-suggestions.ts'

/**
 * The ends of a connector, `from` where its way starts and `to` where it ends; null for an end without a level.
 * `known` is false when the tags have two levels but no `incline`, so the way's direction is not known.
 */
export type LevelPair = { from: number | null; to: number | null; known: boolean }

/** The `incline` tag as a direction; anything else (a slope such as `10%`, a missing tag) is undefined */
export function inclineTag(tags: Readonly<Record<string, string>>): 'up' | 'down' | undefined {
  if (tags.incline === 'up' || tags.incline === 'down') return tags.incline
  return undefined
}

/**
 * The ends of a connector from its `level` and `incline`: `level=0;1` with `incline=up` goes from 0 to 1, with `down`
 * from 1 to 0, without an incline from 0 to 1 but not known. One level: that level is `from`, `to` is empty.
 */
export function pairOf(tags: Readonly<Record<string, string>>): LevelPair {
  const { levels } = levelsOf(tags)
  if (levels.length === 0) return { from: null, to: null, known: true }
  if (levels.length === 1) return { from: levels[0] ?? null, to: null, known: true }
  const low = levels[0] ?? null
  const high = levels[levels.length - 1] ?? null
  const incline = inclineTag(tags)
  if (incline === 'down') return { from: high, to: low, known: true }
  return { from: low, to: high, known: incline !== undefined }
}

/** The tag values that write a connector from `from` to `to`: `level` as `<min>;<max>` and the `incline` along the way */
export function pairValue(from: number, to: number): { value: string; incline: 'up' | 'down' } {
  return { value: `${Math.min(from, to)};${Math.max(from, to)}`, incline: inclineOf(from, to) }
}

/** The ends a level suggestion would give (`0;1` with its incline), read the same way as `pairOf` reads tags */
export function pairOfSuggestion(suggestion: LevelSuggestion): LevelPair {
  const tags: Record<string, string> = { level: suggestion.value }
  if (suggestion.incline) tags.incline = suggestion.incline
  return pairOf(tags)
}

/** The suggestion that joins two levels ("connects 0 and 1"), when the offers have one */
export function pairSuggestion(
  suggestions: readonly LevelSuggestion[],
): LevelSuggestion | undefined {
  return suggestions.find(
    (suggestion) =>
      suggestion.value.includes(';') &&
      suggestion.reasons.some((reason) => reason.startsWith('connects')),
  )
}

/** The incline a swap writes: up becomes down, down becomes up, a missing incline becomes down */
export function nextIncline(current: 'up' | 'down' | undefined): 'up' | 'down' {
  return current === 'down' ? 'up' : 'down'
}

/** A single level as a number (`2`, `-1`); null for a pair, a range or anything else */
export function levelNumber(value: string): number | null {
  return /^-?\d+$/.test(value) ? Number(value) : null
}

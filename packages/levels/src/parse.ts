/** A level is a number: negative below ground, decimals for mezzanines (`-1.3`, `0.5`) */

/** What a value could not be read as, so that validation can report it */
export type LevelProblem = {
  /** The tag that holds the value, e.g. `level` */
  key: string
  /** The part that could not be read, e.g. `0,5` */
  part: string
  /** Why: a comma instead of a point, an empty part, a range that runs downwards, not a number, ... */
  reason: 'comma' | 'empty' | 'not-a-number' | 'reversed-range' | 'too-wide' | 'duplicate'
}

export type Levels = {
  /** The levels the feature is on, sorted upwards, without duplicates; empty when it has no level */
  levels: readonly number[]
  /** Parts that could not be read (they add no level) */
  problems: readonly LevelProblem[]
}

/** One tag value to read, with the tag's key for the problems */
type Entry = { key: string; value: string }

/** A number as written: optional minus, digits, optional decimal part (`-1.3`, `0.5`, `40`) */
const NUMBER = /^-?\d+(\.\d+)?$/
/** A range of whole numbers: `0-6`, `-1-0`, `-3--1` (the minus of a negative end belongs to the number) */
const RANGE = /^(-?\d+)-(-?\d+)$/

/** The widest range read as levels: a building has fewer floors; a wider one is a typo (`0-1000`) */
const MAX_RANGE = 200

/** The value of a number as written; `+ 0` turns `-0` into `0` */
function numberOf(text: string): number {
  return Number(text) + 0
}

/**
 * Reads the levels of several tag values together, so that a level named twice (within one value or across them) is
 * a duplicate. A duplicate is reported once per level.
 */
function readEntries(entries: readonly Entry[]): Levels {
  const levels = new Set<number>()
  const reported = new Set<number>()
  const problems: LevelProblem[] = []

  for (const { key, value } of entries) {
    for (const raw of value.split(';')) {
      const part = raw.trim()
      const add = (level: number): void => {
        if (!levels.has(level)) {
          levels.add(level)
        } else if (!reported.has(level)) {
          reported.add(level)
          problems.push({ key, part, reason: 'duplicate' })
        }
      }

      if (part === '') {
        problems.push({ key, part, reason: 'empty' })
      } else if (part.includes(',')) {
        problems.push({ key, part, reason: 'comma' })
      } else if (NUMBER.test(part)) {
        add(numberOf(part))
      } else {
        const range = RANGE.exec(part)
        if (range === null) {
          problems.push({ key, part, reason: 'not-a-number' })
        } else {
          const from = numberOf(range[1] ?? '')
          const to = numberOf(range[2] ?? '')
          if (from > to) {
            problems.push({ key, part, reason: 'reversed-range' })
          } else if (to - from > MAX_RANGE) {
            problems.push({ key, part, reason: 'too-wide' })
          } else {
            for (let level = from; level <= to; level++) add(level)
          }
        }
      }
    }
  }

  return { levels: [...levels].sort((a, b) => a - b), problems }
}

/**
 * The levels of one tag value: `;` separates levels, `a-b` is every whole level from a to b and both ends
 * (`-1-0`, `0-6`), a decimal stands for itself. `key` is used in the problems only.
 */
export function parseLevels(value: string, key = 'level'): Levels {
  return readEntries([{ key, value }])
}

/**
 * The levels of a feature from its tags: `level`, plus `repeat_on` (the same feature on more levels), or the range
 * `min_level`..`max_level` when there is no `level` (a building part, an elevator shaft).
 */
export function levelsOf(tags: Readonly<Record<string, string>>): Levels {
  const entries: Entry[] = []
  const level = tags.level
  const repeatOn = tags.repeat_on
  if (level !== undefined) entries.push({ key: 'level', value: level })
  if (repeatOn !== undefined) entries.push({ key: 'repeat_on', value: repeatOn })
  if (entries.length > 0) return readEntries(entries)

  // No level: the range from min_level to max_level, whichever of the two is a number
  const min = tags.min_level
  const max = tags.max_level
  const low = min !== undefined && NUMBER.test(min) ? numberOf(min) : undefined
  const high = max !== undefined && NUMBER.test(max) ? numberOf(max) : undefined
  if (low === undefined || high === undefined) {
    const only = low ?? high
    return { levels: only === undefined ? [] : [only], problems: [] }
  }
  if (low > high) {
    return {
      levels: [],
      problems: [{ key: 'min_level', part: `${min}-${max}`, reason: 'reversed-range' }],
    }
  }
  if (low === high) return { levels: [low], problems: [] }
  if (high - low > MAX_RANGE) {
    return {
      levels: [],
      problems: [{ key: 'min_level', part: `${min}-${max}`, reason: 'too-wide' }],
    }
  }

  const levels: number[] = []
  for (let whole = Math.ceil(low) + 0; whole <= high; whole++) levels.push(whole)
  return { levels, problems: [] }
}

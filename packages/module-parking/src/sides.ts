/**
 * The sides of a road a parking tag is about, and the per-side keys: `parking:left:orientation`,
 * `parking:both:fee`, `parking:right`. Pure.
 *
 * A road has two sides, left and right in the way's direction. `both` is a shorthand in the tags for "left and
 * right have the same value", never a third side. Reading and writing follow iD's directional fields
 * (.reference/id/modules/ui/fields/directional_combo.js; here packages/ui/src/inspector/fields/directional-logic.ts):
 * - a side's own key wins; else the `both` key holds the value for both sides;
 * - writing one side leaves the other side the value it had, and when the two sides then have the same value the
 *   `both` key holds it and the side keys go; otherwise each side has its own key and `both` goes.
 * The buttons, the restriction field and the operations all write through `writeSide`, so they agree with the
 * inspector's directional fields. This file does not import the ui package: its logic also knows the spellings
 * without `:both` (`cycleway=left`), which parking keys do not have.
 */
export const SIDES = ['left', 'right', 'both'] as const
export type Side = (typeof SIDES)[number]
/** One real side of the road (`both` is the shorthand for the two) */
export type RealSide = Exclude<Side, 'both'>

/** One edit of one tag: `value` undefined removes the key */
export type TagEdit = { key: string; value: string | undefined }

type Tags = Readonly<Record<string, string | undefined>>

/** `sideKey('left', 'orientation')` is `parking:left:orientation`; without a suffix it is `parking:left` */
export function sideKey(side: Side, suffix?: string) {
  return suffix ? `parking:${side}:${suffix}` : `parking:${side}`
}

function has(value: string | undefined): value is string {
  return value !== undefined && value !== ''
}

/** A parking key of a side: `parking:left` (suffix undefined), `parking:both:fee`. Undefined for any other key. */
export function parseSideKey(key: string): { side: Side; suffix: string | undefined } | undefined {
  const match = /^parking:(left|right|both)(?::(.+))?$/.exec(key)
  if (!match) return undefined
  return { side: match[1] as Side, suffix: match[2] }
}

/** The suffixes the parking keys of the tags have, over all three spellings: `fee` for `parking:left:fee`, undefined for `parking:both` */
export function sideSuffixes(tags: Tags): Set<string | undefined> {
  const suffixes = new Set<string | undefined>()
  for (const [key, value] of Object.entries(tags)) {
    const parsed = parseSideKey(key)
    if (parsed && has(value)) suffixes.add(parsed.suffix)
  }
  return suffixes
}

/**
 * The value a side has for a suffix: its own key, else the `both` key. `both` is the value the two sides share
 * (from the `both` key or from two equal side keys). Undefined when the side has none, or the sides differ.
 */
export function readSide(tags: Tags, side: Side, suffix?: string): string | undefined {
  if (side === 'both') {
    const left = readSide(tags, 'left', suffix)
    return left !== undefined && left === readSide(tags, 'right', suffix) ? left : undefined
  }
  const own = tags[sideKey(side, suffix)]
  if (has(own)) return own
  const both = tags[sideKey('both', suffix)]
  return has(both) ? both : undefined
}

/**
 * The edits for setting a suffix on a side (`undefined` clears it). Only keys whose value changes are returned.
 * - `both`: the `both` key gets the value and the keys of the two sides go.
 * - `left` or `right`: the other side keeps the value it reads. When both sides then have the same value it is
 *   written as `both`; otherwise each side gets its own key and `both` goes.
 */
export function writeSide(
  tags: Tags,
  side: Side,
  suffix: string | undefined,
  value: string | undefined,
): TagEdit[] {
  const next = has(value) ? value : undefined
  const keys = {
    left: sideKey('left', suffix),
    right: sideKey('right', suffix),
    both: sideKey('both', suffix),
  }
  const written: Record<Side, string | undefined> = {
    left: undefined,
    right: undefined,
    both: next,
  }
  if (side !== 'both') {
    const other: RealSide = side === 'left' ? 'right' : 'left'
    const kept = readSide(tags, other, suffix)
    if (kept !== next) {
      written.both = undefined
      written[side] = next
      written[other] = kept
    }
  }
  const edits: TagEdit[] = []
  for (const name of SIDES) {
    if ((tags[keys[name]] ?? '') !== (written[name] ?? ''))
      edits.push({ key: keys[name], value: written[name] })
  }
  return edits
}

/** The tags after edits: a removal (value undefined) drops its key */
export function applyEdits(tags: Tags, edits: readonly TagEdit[]): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(tags)) if (value !== undefined) next[key] = value
  for (const edit of edits) {
    if (edit.value === undefined) delete next[edit.key]
    else next[edit.key] = edit.value
  }
  return next
}

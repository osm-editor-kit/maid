/**
 * The sides of a road a parking tag is about, and the per-side keys: `parking:left:orientation`,
 * `parking:both:fee`, `parking:right`. Pure.
 *
 * Reading and writing follow how the directional fields of the inspector do it
 * (packages/ui/src/inspector/fields/directional-logic.ts: `directionalValues`, `directionalWrite`):
 * - a side's own key wins; else the `both` key holds the value for both sides;
 * - writing one side while `both` holds a value splits it: the other side gets the value `both` had,
 *   `both` goes, and this side gets the new value.
 * This file does not import the ui package: the ui's logic is bound to its two-sided combo field and to
 * `cycleway`/`sidewalk` spelling, and parking has three sides and a plain key (`parking:left`) as well.
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

/**
 * The value a side has for a suffix: its own key, else the `both` key. For `both` only the `both` key counts.
 * Undefined when neither is set.
 */
export function readSide(tags: Tags, side: Side, suffix?: string) {
  const own = tags[sideKey(side, suffix)]
  if (has(own)) return own
  if (side === 'both') return undefined
  const both = tags[sideKey('both', suffix)]
  return has(both) ? both : undefined
}

/**
 * The edits for setting a suffix on one side (`undefined` clears it). Only keys whose value changes are returned.
 * - `left` or `right` while `both` has a value: split. The other side gets the value `both` had (unless it has a
 *   value of its own), `both` is removed, this side gets the new value.
 * - `both`: sets the `both` key and removes the keys of both sides.
 */
export function writeSide(
  tags: Tags,
  side: Side,
  suffix: string | undefined,
  value: string | undefined,
): TagEdit[] {
  const next = has(value) ? value : undefined
  const written = new Map<string, string | undefined>()
  if (side === 'both') {
    written.set(sideKey('both', suffix), next)
    written.set(sideKey('left', suffix), undefined)
    written.set(sideKey('right', suffix), undefined)
  } else {
    const bothKey = sideKey('both', suffix)
    const both = tags[bothKey]
    if (has(both)) {
      const other: RealSide = side === 'left' ? 'right' : 'left'
      const otherKey = sideKey(other, suffix)
      written.set(bothKey, undefined)
      written.set(otherKey, has(tags[otherKey]) ? tags[otherKey] : both)
    }
    written.set(sideKey(side, suffix), next)
  }
  const edits: TagEdit[] = []
  for (const [key, to] of written) {
    if ((tags[key] ?? '') !== (to ?? '')) edits.push({ key, value: to })
  }
  return edits
}

import type { Tags } from '@osm-editor-kit/maid-presets'
import type { TagEdit } from '../logic.ts'

/**
 * The keys of a directionalCombo field, named as iD's directional_combo.js names them:
 * - `common`: the field's key (`cycleway`, `sidewalk:both`, `parking:both:orientation`);
 * - `other`: the other spelling of the common key, with or without `:both`;
 * - `both`: the spelling with `:both` (`cycleway:both`, `sidewalk:both`);
 * - `fallback`: the spelling without `:both`, whose value may be a direction (`cycleway=left`);
 * - `left` and `right`: the side keys (`cycleway:left`, `sidewalk:right`, `parking:left:orientation`).
 */
export type DirectionalKeys = {
  common: string
  other: string
  both: string
  fallback: string
  left: string
  right: string
}

export type DirectionalSide = 'left' | 'right'

/** The keys of a directionalCombo field, from its key (iD's directional_combo.js:89-96, :133-142). */
export function directionalKeys(key: string): DirectionalKeys {
  const hasBoth = key.includes(':both')
  const other = hasBoth ? key.replace(/:both(:|$)/, '$1') : `${key}:both`
  const both = hasBoth ? key : other
  const fallback = hasBoth ? other : key
  const side = (direction: DirectionalSide) => both.replace(/:both(:|$)/, `:${direction}$1`)
  return { common: key, other, both, fallback, left: side('left'), right: side('right') }
}

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value !== ''
}

/** The first value that is not empty. */
function firstValue(...values: (string | undefined)[]): string | undefined {
  return values.find(nonEmpty)
}

/**
 * Whether `value` is a part of `tagKey` after a colon, as iD's `:<value>(:|$)` test on the key:
 * `left` is a part of `cycleway:left`, `lane` is not a part of any key.
 */
function isPartOf(tagKey: string, value: string): boolean {
  return tagKey.includes(`:${value}:`) || tagKey.endsWith(`:${value}`)
}

/** Whether the value names a side of the field (left or right) as a part of one of its side keys. */
function namesSide(keys: DirectionalKeys, value: string): boolean {
  return isPartOf(keys.left, value) || isPartOf(keys.right, value)
}

function sideKeyOf(keys: DirectionalKeys, side: DirectionalSide): string {
  return side === 'left' ? keys.left : keys.right
}

/**
 * The value a side shows. Its own key wins when it has a value. Otherwise the common keys decide,
 * as iD's read does: `both` means yes; a direction gives yes for its side and no for the other;
 * any other value is the value of both sides; the `:both` key is the value of both sides.
 */
function sideValue(keys: DirectionalKeys, tags: Tags, side: DirectionalSide): string | undefined {
  const own = tags[sideKeyOf(keys, side)]
  if (nonEmpty(own)) return own
  const fallback = tags[keys.fallback]
  if (nonEmpty(fallback)) {
    if (fallback === 'both') return 'yes'
    if (namesSide(keys, fallback)) return isPartOf(sideKeyOf(keys, side), fallback) ? 'yes' : 'no'
    return fallback
  }
  const both = tags[keys.both]
  return nonEmpty(both) ? both : undefined
}

/** The values the two sides show, as the field reads them from the tags. */
export function directionalValues(
  keys: DirectionalKeys,
  tags: Tags,
): { left: string | undefined; right: string | undefined } {
  return { left: sideValue(keys, tags, 'left'), right: sideValue(keys, tags, 'right') }
}

/**
 * The edits for choosing `value` on one side (undefined clears the side), as iD's `change`
 * (directional_combo.js:88-128) with the explicit side winning on read:
 * - the other side gets the value it had; a `:both` or direction value is turned into yes or no
 *   for it first;
 * - when both sides end with the same value, the common key holds it and the side keys go;
 * - otherwise both side keys hold their values and the common keys go.
 * Only keys whose value changes are returned, in the order: the side, the common key, the other
 * spelling, the other side.
 */
export function directionalWrite(
  keys: DirectionalKeys,
  tags: Tags,
  side: DirectionalSide,
  value: string | undefined,
): TagEdit[] {
  const next = nonEmpty(value) ? value : undefined
  const sideKey = sideKeyOf(keys, side)
  const otherSide: DirectionalSide = side === 'left' ? 'right' : 'left'
  const otherKey = sideKeyOf(keys, otherSide)
  const fallback = tags[keys.fallback]

  let otherValue = firstValue(tags[otherKey], tags[keys.common], tags[keys.other])
  if (fallback === 'both' && !nonEmpty(tags[otherKey])) {
    otherValue = 'yes'
  } else if (nonEmpty(fallback) && !nonEmpty(tags[otherKey])) {
    if (isPartOf(otherKey, fallback)) otherValue = 'yes'
    else if (isPartOf(sideKey, fallback)) otherValue = 'no'
  }

  const written = new Map<string, string | undefined>()
  if (next === otherValue) {
    // both sides agree: the common key holds the value
    written.set(keys.common, next)
    written.set(sideKey, undefined)
    written.set(otherKey, undefined)
    written.set(keys.other, undefined)
  } else {
    written.set(sideKey, next)
    written.set(keys.common, undefined)
    written.set(keys.other, undefined)
    written.set(otherKey, otherValue)
  }

  const edits: TagEdit[] = []
  for (const [key, value] of written) {
    if ((tags[key] ?? '') !== (value ?? '')) edits.push({ key, value })
  }
  return edits
}

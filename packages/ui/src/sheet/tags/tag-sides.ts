/**
 * The "sides" view of the Tags sheet: the keys that describe the left and the right of a road (cycleway, sidewalk,
 * parking) as groups, and `:both` shown as its two sides. What is stored does not change: two sides with the same
 * value are written as `:both` again (mergeSides). Pure: no React, no DOM.
 *
 * A key belongs to a group when the group is its first part (`cycleway`, `cycleway:left:width`) or its second, after a
 * meta prefix (`source:cycleway:both:width`, `fixme:sidewalk`, `mapillary:cycleway:right`). TILDA reads the meta
 * prefixes `source` and `note` the same way (processing/topics/roads_bikelanes/bikelanes/transformations.lua:
 * `<metaPrefix>:<prefix>:<infix>:SUFFIX`); here any first part counts, so `fixme` and `check_date` sort in too.
 */
import type { Tags } from '@osm-editor-kit/maid-presets'
import { codeUnits } from './tags.ts'

/** The keys whose parts describe the two sides of a road */
export const SIDE_GROUPS = ['cycleway', 'sidewalk', 'parking'] as const
export type SideGroup = (typeof SIDE_GROUPS)[number]

const GROUPS = new Set<string>(SIDE_GROUPS)

/** Where a key stands in its group: the group, the meta prefix before it, and the key without the meta prefix */
export type SidePlace = { group: SideGroup; meta: string | undefined; path: string }

/** The group of a key, or undefined when it describes no side group */
export function sidePlaceOf(key: string): SidePlace | undefined {
  const parts = key.split(':')
  const [first, second] = parts
  if (first !== undefined && GROUPS.has(first)) {
    return { group: first as SideGroup, meta: undefined, path: key }
  }
  if (second !== undefined && first !== undefined && first !== '' && GROUPS.has(second)) {
    return { group: second as SideGroup, meta: first, path: parts.slice(1).join(':') }
  }
  return undefined
}

/**
 * The order of the sides view: a group sorts where its name would, and inside it the keys sort without their meta
 * prefix, the plain key first, so `source:cycleway:both:width` stands right under `cycleway:both:width`. Other keys
 * sort as iD sorts them (`codeUnits`).
 */
export function compareSideKeys(a: string, b: string): number {
  const pa = sidePlaceOf(a)
  const pb = sidePlaceOf(b)
  const first = codeUnits(pa?.group ?? a, pb?.group ?? b)
  if (first !== 0) return first
  // a group before a plain key of the same name can not happen: the plain key `cycleway` is in the group
  if (pa === undefined || pb === undefined) return pa === undefined ? -1 : pb === undefined ? 1 : 0
  return codeUnits(pa.path, pb.path) || codeUnits(pa.meta ?? '', pb.meta ?? '')
}

/** The key with its side part (right after the group) set to `side`, or undefined when it has no side part */
function withSide(key: string, side: 'left' | 'right' | 'both'): string | undefined {
  const place = sidePlaceOf(key)
  if (place === undefined) return undefined
  const parts = key.split(':')
  const at = place.meta === undefined ? 1 : 2
  const current = parts[at]
  if (current !== 'left' && current !== 'right' && current !== 'both') return undefined
  parts[at] = side
  return parts.join(':')
}

/** The side a key describes (`cycleway:left:width` → left), or undefined */
export function sideOf(key: string): 'left' | 'right' | 'both' | undefined {
  const place = sidePlaceOf(key)
  if (place === undefined) return undefined
  const part = key.split(':')[place.meta === undefined ? 1 : 2]
  return part === 'left' || part === 'right' || part === 'both' ? part : undefined
}

/** The same key on the other side (`left` ↔ `right`), or undefined for a key without one */
export function otherSideKey(key: string): string | undefined {
  const side = sideOf(key)
  if (side === 'left') return withSide(key, 'right')
  if (side === 'right') return withSide(key, 'left')
  return undefined
}

/**
 * The tags as the sides view shows them: every `…:both…` key of a side group as its `left` and `right` key. A `both`
 * key whose side already has another value stays as it is (the data says two things; the person sees both).
 */
export function splitBoth(tags: Tags): Tags {
  const out: Record<string, string> = { ...tags }
  for (const [key, value] of Object.entries(tags)) {
    if (sideOf(key) !== 'both') continue
    const left = withSide(key, 'left')
    const right = withSide(key, 'right')
    if (left === undefined || right === undefined) continue
    const clash = [left, right].some((side) => tags[side] !== undefined && tags[side] !== value)
    if (clash) continue
    delete out[key]
    out[left] = value
    out[right] = value
  }
  return out
}

/**
 * The tags to store after a change in the sides view. A `left` and `right` key with the same value become one `both`
 * key when the feature had that `both` key, or when the change touched one of the two (a side set to the value of the
 * other). Two equal sides that nobody touched and that were stored apart stay apart: the view does not rewrite data
 * the person did not change.
 *
 * `next`: the shown tags after the change. `shown`: the shown tags before it. `stored`: the feature's tags.
 */
export function mergeSides(next: Tags, shown: Tags, stored: Tags): Tags {
  const out: Record<string, string> = { ...next }
  for (const [key, value] of Object.entries(next)) {
    if (sideOf(key) !== 'left') continue
    const right = withSide(key, 'right')
    const both = withSide(key, 'both')
    if (right === undefined || both === undefined) continue
    if (next[right] !== value || next[both] !== undefined) continue
    const touched = shown[key] !== value || shown[right] !== next[right]
    if (stored[both] === undefined && !touched) continue
    delete out[key]
    delete out[right]
    out[both] = value
  }
  return out
}

/** True when two sets of tags have the same keys and values */
export function sameTags(a: Tags, b: Tags): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => b[key] === a[key])
}

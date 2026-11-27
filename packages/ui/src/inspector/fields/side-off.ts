/**
 * What stays valid on a side that is off. The side key of a group (`parking:left`, `cycleway:right`, `sidewalk:left`)
 * can say that the side has nothing to describe (`no`, `none`) or that it is mapped as its own way (`separate`). The
 * other tags of that side (`parking:left:orientation`) then make no sense, except the few that say why there is none
 * (`parking:left:restriction`, `parking:left:reason`): side-off-attributes.json, with sources in
 * docs/research/side-off-attributes.md. One list for the Tags sheet (sheet/tags/tag-sides.ts) and the inspector's
 * sub fields (directional-group-logic.ts), so the two never disagree on what is valid. Pure: no React, no DOM.
 */
import { m } from '@osm-editor-kit/maid-i18n'
import offAttributes from './side-off-attributes.json'

/** The keys whose parts describe the two sides of a road, in the order the Tags sheet shows them: from the edge of the
 * road outwards, as the street is crossed */
export const SIDE_GROUPS = ['sidewalk', 'cycleway', 'parking'] as const
export type SideGroup = (typeof SIDE_GROUPS)[number]

/** The values of a side's own key that say the side has nothing on the road: no cycleway, sidewalk or parking there */
export const SIDE_OFF_VALUES: readonly string[] = ['separate', 'no', 'none']

/** Whether the value of a side says that the side is off */
export function isSideOffValue(value: string | undefined): value is string {
  return value !== undefined && SIDE_OFF_VALUES.includes(value)
}

/** The group of a key without a meta prefix (`parking:both` → parking), or undefined when it is none of SIDE_GROUPS */
export function sideGroupOfKey(key: string): SideGroup | undefined {
  const first = key.split(':')[0]
  return SIDE_GROUPS.find((group) => group === first)
}

/** The attributes a side that is off may still have, by group and value (side-off-attributes.json) */
const OFF_ATTRIBUTES = offAttributes as unknown as Partial<
  Record<SideGroup, Partial<Record<string, readonly string[]>>>
>

/**
 * Whether the attribute `suffix` (what follows `<group>:<side>:`, without the colon) may have a value on a side whose
 * own key is `value` (no, none, separate): the attributes listed for the group and value (`restriction` says why there
 * is no parking). The side key's own meta keys have no suffix and are always valid. An entry ending in `:*` allows
 * every suffix below it (`restriction:*`: the vehicle classes, `:conditional`, `:reason`).
 */
export function suffixAllowedWhenOff(group: SideGroup, value: string, suffix: string): boolean {
  if (suffix === '') return true
  return (OFF_ATTRIBUTES[group]?.[value] ?? []).some((entry) =>
    entry.endsWith(':*') ? suffix.startsWith(entry.slice(0, -1)) : entry === suffix,
  )
}

/**
 * The error of a value left on a side that is off, with what to do about it: remove it (no, none); move it to the
 * separately mapped way (separate). `sideKey` is the side's own key (`parking:left`).
 */
export function sideOffError(value: string, sideKey: string): string {
  return value === 'separate'
    ? m.ui_tags_side_separate({ key: sideKey })
    : m.ui_tags_side_none({ key: sideKey, value })
}

/**
 * What a quick-tag button does to the tags of a road: whether it is pressed, the edits that set or remove it, and the
 * plan for several roads. Pure: no React, no editor. Built on `readSide` and `writeSide` (../sides.ts), so the buttons
 * read and write the sides exactly as the inspector's fields do: `both` is pressed when the two sides share the
 * value, and a side that gets the value of the other is written as `both`.
 */
import {
  applyEdits,
  parseSideKey,
  readSide,
  sideKey,
  sideSuffixes,
  writeSide,
  type RealSide,
  type TagEdit,
} from '../sides.ts'
import type { QuickTag } from './quick-tags.ts'

export type TagsOf = Readonly<Record<string, string | undefined>>

/** A road's tags, with its id, for planning a change to several roads */
export type RoadTags = { id: string; tags: TagsOf }

/** `on`: every road has the button's tags; `mixed`: some do; `off`: none does */
export type PressedState = 'on' | 'mixed' | 'off'

/** The side and suffix of a button's edit. Every button edits side keys only (quick-tags.test.ts checks it). */
function sideOf(edit: TagEdit) {
  const parsed = parseSideKey(edit.key)
  if (!parsed) throw new Error(`not a parking side key: ${edit.key}`)
  return parsed
}

/** True when every edit of the button is in the tags, as the sides read them. A clearing button is never pressed. */
export function isPressed(tags: TagsOf, tag: QuickTag): boolean {
  if (tag.clearSide) return false
  return (
    tag.edits.length > 0 &&
    tag.edits.every((edit) => {
      const { side, suffix } = sideOf(edit)
      return readSide(tags, side, suffix) === edit.value
    })
  )
}

/** The pressed state over several roads: `on` when all have the tags, `mixed` when some have them */
export function pressedState(roads: readonly TagsOf[], tag: QuickTag): PressedState {
  const pressed = roads.filter((tags) => isPressed(tags, tag)).length
  if (roads.length > 0 && pressed === roads.length) return 'on'
  return pressed > 0 ? 'mixed' : 'off'
}

/** The tags after several side writes, one after the other (each sees what the one before wrote) */
function writeAll(
  tags: TagsOf,
  writes: readonly {
    side: 'left' | 'right' | 'both'
    suffix: string | undefined
    value: string | undefined
  }[],
): Record<string, string> {
  let work = applyEdits(tags, [])
  for (const { side, suffix, value } of writes)
    work = applyEdits(work, writeSide(work, side, suffix, value))
  return work
}

/** The tags without every parking value of one side (left or right); the other side keeps what it reads */
export function clearSide(tags: TagsOf, side: RealSide): Record<string, string> {
  return writeAll(
    tags,
    [...sideSuffixes(tags)].map((suffix) => ({ side, suffix, value: undefined })),
  )
}

/**
 * The tags of a road after a click: `on` sets each of the button's values on its side, `off` removes them from it
 * (for a `both` button from both sides). A clearing button clears its side whatever `on` says.
 */
export function roadTags(tags: TagsOf, tag: QuickTag, on: boolean): Record<string, string> {
  if (tag.clearSide) return clearSide(tags, tag.clearSide)
  return writeAll(
    tags,
    tag.edits.map((edit) => ({ ...sideOf(edit), value: on ? edit.value : undefined })),
  )
}

function sameTags(a: TagsOf, b: TagsOf) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) if ((a[key] ?? undefined) !== (b[key] ?? undefined)) return false
  return true
}

/**
 * The change of each road that a button makes, for a click: `on` sets the button's tags (or clears its side),
 * `off` removes them. Only roads whose tags really change are returned; none means nothing to do.
 */
export function planQuickTag(
  roads: readonly RoadTags[],
  tag: QuickTag,
  on: boolean,
): { id: string; tags: Record<string, string> }[] {
  const plan: { id: string; tags: Record<string, string> }[] = []
  for (const road of roads) {
    const tags = roadTags(road.tags, tag, on)
    if (!sameTags(road.tags, tags)) plan.push({ id: road.id, tags })
  }
  return plan
}

/** What a click does to a button: set it when it is not pressed on every road, else remove it (a clearing button clears) */
export function clickIsOn(state: PressedState): boolean {
  return state !== 'on'
}

/** The key of a side for a focus on the map: the button's first key, or the side key */
export function focusKeyOf(tag: QuickTag): string {
  return tag.edits[0]?.key ?? sideKey(tag.side)
}

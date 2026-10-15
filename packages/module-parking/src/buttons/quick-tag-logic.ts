/**
 * What a quick-tag button does to the tags of a road: whether it is pressed, which value a cell has, the click that
 * goes to the next value, and the plan for several roads. Pure: no React, no editor. Built on `readSide` and
 * `writeSide` (../sides.ts), so the buttons read and write the sides exactly as the inspector's fields do: `both` is
 * the value the two sides share, and a side that gets the value of the other is written as `both`.
 */
import {
  applyEdits,
  parseSideKey,
  readSide,
  sideKey,
  sideSuffixes,
  writeSide,
  type Side,
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

/**
 * True when the tags read every value of the button on `side`, as the sides read them (a side's own key, or the
 * `both` key). The edits' keys are read on the side the button is about.
 */
function readsAs(tags: TagsOf, tag: QuickTag, side: Side): boolean {
  return (
    tag.edits.length > 0 &&
    tag.edits.every((edit) => readSide(tags, side, sideOf(edit).suffix) === edit.value)
  )
}

/**
 * True when the button is pressed. `both` is pressed when the two sides share its values. A left or right button is
 * pressed only when its side differs from the other: when the two sides are equal, the `both` button shows it and
 * the two side buttons do not. A clearing button is never pressed.
 */
export function isPressed(tags: TagsOf, tag: QuickTag): boolean {
  if (tag.clearSide) return false
  if (tag.side === 'both') return readsAs(tags, tag, 'both')
  const other: Side = tag.side === 'left' ? 'right' : 'left'
  return readsAs(tags, tag, tag.side) && !readsAs(tags, tag, other)
}

/** The pressed state over several roads: `on` when all have the tags, `mixed` when some have them */
export function pressedState(roads: readonly TagsOf[], tag: QuickTag): PressedState {
  const pressed = roads.filter((tags) => isPressed(tags, tag)).length
  if (roads.length > 0 && pressed === roads.length) return 'on'
  return pressed > 0 ? 'mixed' : 'off'
}

/**
 * The index of the value a road has in a cell (the buttons of one row and side, in cycle order), or undefined when it
 * has none of them. A side's value counts even when the other side has the same one: the cell goes on from it.
 */
export function valueIndex(tags: TagsOf, cell: readonly QuickTag[]): number | undefined {
  const index = cell.findIndex((tag) => readsAs(tags, tag, tag.side))
  return index === -1 ? undefined : index
}

/** The state of a cell over several roads: its value when they all have the same one, and what the cell shows */
export type CellState = {
  /** The value index every road has; undefined when none has one, or when the roads differ (`mixed`) */
  current: number | undefined
  /** True when the roads do not all have the same value */
  mixed: boolean
  /** Pressed on every road, on some (`mixed`), or none. A road where both sides have the value does not press a side. */
  pressed: PressedState
}

export function cellState(roads: readonly TagsOf[], cell: readonly QuickTag[]): CellState {
  const indices = roads.map((tags) => valueIndex(tags, cell))
  const mixed = indices.some((index) => index !== indices[0])
  const current = mixed ? undefined : indices[0]
  const tag = current === undefined ? undefined : cell[current]
  const pressed: PressedState = mixed ? 'mixed' : tag ? pressedState(roads, tag) : 'off'
  return { current, mixed, pressed }
}

/**
 * The value a click goes to: the first one when the cell has none (or the roads differ), the next one, and after the
 * last one undefined: the cell is unset. A toggle has one value: on, then off.
 */
export function nextIndex(current: number | undefined, count: number): number | undefined {
  if (current === undefined) return 0
  return current + 1 < count ? current + 1 : undefined
}

/** The tags without every parking value of one side (`both`: of both sides); the other side keeps what it reads */
export function clearSide(tags: TagsOf, side: Side): Record<string, string> {
  if (side === 'both') {
    const next: Record<string, string> = {}
    for (const [key, value] of Object.entries(tags))
      if (value !== undefined && !parseSideKey(key)) next[key] = value
    return next
  }
  return writeAll(
    tags,
    [...sideSuffixes(tags)].map((suffix) => ({ side, suffix, value: undefined })),
  )
}

/** The tags after several side writes, one after the other (each sees what the one before wrote) */
function writeAll(
  tags: TagsOf,
  writes: readonly {
    side: Side
    suffix: string | undefined
    value: string | undefined
  }[],
): Record<string, string> {
  let work = applyEdits(tags, [])
  for (const { side, suffix, value } of writes)
    work = applyEdits(work, writeSide(work, side, suffix, value))
  return work
}

/**
 * The tags of a road after a click on a button: `on` sets each of its values on its side, `off` removes them from it
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

/** What a click on a cell does: the button whose value it sets or removes, whether it sets it, and the roads that change */
export type CellPlan = {
  tag: QuickTag
  on: boolean
  changes: { id: string; tags: Record<string, string> }[]
}

/**
 * The plan for a click on a cell over several roads: the next value on all of them (the first one when they differ),
 * and after the last value the value removed. A clearing cell clears its side. Undefined for an empty cell.
 */
export function planCell(
  roads: readonly RoadTags[],
  cell: readonly QuickTag[],
): CellPlan | undefined {
  const first = cell[0]
  if (!first) return undefined
  if (first.clearSide) return { tag: first, on: true, changes: planQuickTag(roads, first, true) }
  const state = cellState(
    roads.map((road) => road.tags),
    cell,
  )
  const next = nextIndex(state.current, cell.length)
  const tag = cell[next ?? state.current ?? 0]
  if (!tag) return undefined
  const on = next !== undefined
  // a position value other than `no` (lane, separate) is parking: the reason of no parking on that side goes with it
  const takesReason = on && tag.row === 'position' && tag.edits[0]?.value !== 'no'
  return {
    tag,
    on,
    changes: takesReason ? planWithoutReason(roads, tag) : planQuickTag(roads, tag, on),
  }
}

/** The tags with the reason of one side removed (`both`: of both sides); other keys are kept */
function withoutReason(tags: TagsOf, side: Side): Record<string, string> {
  const sides: Side[] = side === 'both' ? ['left', 'right'] : [side]
  return writeAll(
    tags,
    sides.map((name) => ({ side: name, suffix: 'reason', value: undefined })),
  )
}

/** The change of each road for a button that sets a parking value and removes the reason of its side(s) */
function planWithoutReason(
  roads: readonly RoadTags[],
  tag: QuickTag,
): { id: string; tags: Record<string, string> }[] {
  const plan: { id: string; tags: Record<string, string> }[] = []
  for (const road of roads) {
    const tags = withoutReason(roadTags(road.tags, tag, true), tag.side)
    if (!sameTags(road.tags, tags)) plan.push({ id: road.id, tags })
  }
  return plan
}

/** The key of a side for a focus on the map: the button's first key, or the side key */
export function focusKeyOf(tag: QuickTag): string {
  return tag.edits[0]?.key ?? sideKey(tag.side)
}

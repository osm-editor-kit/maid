import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import {
  directionalKeys,
  sideStates,
  type DirectionalSide,
  type SideState,
} from './directional-logic.ts'
import type { CombinedTags } from './shared.ts'
import {
  isSideOffValue,
  SIDE_OFF_VALUES,
  sideGroupOfKey,
  suffixAllowedWhenOff,
} from './side-off.ts'

/**
 * The values of a parent's side that make the sub field of that side meaningless (no parking, no cycle
 * lane on that side). One list for every parent, shared with the Tags sheet (side-off.ts).
 */
export const UNUSED_SIDE_VALUES: readonly string[] = SIDE_OFF_VALUES

/**
 * The suffix that a sub field adds to the side keys of its parent: `:orientation` for `parking:both` and
 * `parking:both:orientation`, since `parking:left` + `:orientation` is `parking:left:orientation` and the
 * right side agrees. Undefined when the field is not a sub field of the parent (the suffix is never empty,
 * so a field is not its own sub field).
 */
export function subFieldSuffix(parentKey: string, subKey: string): string | undefined {
  const parent = directionalKeys(parentKey)
  const sub = directionalKeys(subKey)
  if (!sub.left.startsWith(parent.left)) return undefined
  const suffix = sub.left.slice(parent.left.length)
  if (!suffix.startsWith(':') || sub.right !== `${parent.right}${suffix}`) return undefined
  return suffix
}

/** A field's block in the field list: the field on its own, or a parent with its sub fields in one group. */
export type DirectionalBlock =
  | { kind: 'field'; field: Field }
  | { kind: 'group'; parent: Field; subs: Field[] }

/** Whether `sub` is a sub field of `parent`: both are directional combos with keys, and the sub's keys extend the parent's. */
function isSubOf(parent: Field, sub: Field): boolean {
  if (parent.type !== 'directionalCombo' || sub.type !== 'directionalCombo') return false
  if (parent.key === undefined || sub.key === undefined) return false
  return subFieldSuffix(parent.key, sub.key) !== undefined
}

/**
 * The field list in its order, with each parent's sub fields in one group at the parent's place. A sub
 * field is a directionalCombo whose keys extend the keys of another directionalCombo (subFieldSuffix). Its
 * parent is the first field in the list that is not a sub field itself and that it extends: one level of
 * groups, so a sub field of a sub field joins the parent it extends. A sub field whose parent is missing
 * from the list stays on its own. Other fields keep their place.
 */
export function groupDirectionalFields(fields: readonly Field[]): DirectionalBlock[] {
  const isSub = fields.map((field, index) =>
    fields.some((other, otherIndex) => otherIndex !== index && isSubOf(other, field)),
  )
  // the index of each sub field's parent in the list, if it is in the list
  const parentOf = fields.map((field, index) => {
    if (!isSub[index]) return undefined
    const found = fields.findIndex(
      (other, otherIndex) => !isSub[otherIndex] && isSubOf(other, field),
    )
    return found === -1 ? undefined : found
  })
  const blocks: DirectionalBlock[] = []
  fields.forEach((field, index) => {
    if (parentOf[index] !== undefined) return
    const subs = fields.filter((_, other) => parentOf[other] === index)
    blocks.push(
      subs.length === 0 ? { kind: 'field', field } : { kind: 'group', parent: field, subs },
    )
  })
  return blocks
}

/**
 * Which sides of the parent are off, from the parent's sides (sideStates over the parent's key, as the parent reads
 * them: `parking:both=no` is no on both sides). A side that is mixed over several features is used.
 */
export function unusedSides(
  parentSides: Record<DirectionalSide, SideState>,
): Record<DirectionalSide, boolean> {
  const unused = (state: SideState) => isSideOffValue(state.value)
  return { left: unused(parentSides.left), right: unused(parentSides.right) }
}

/**
 * The sides of a sub field that are disabled, with the value of the parent that turns the side off (no, none,
 * separate): a side that is off (unusedSides) disables the sub field, except the attributes that stay valid there
 * (`reason` and `restriction` of parking; side-off.ts, the list the Tags sheet uses). Undefined: the side is
 * enabled. A parent that is no group of the list (an unknown key) disables every sub field of its off side.
 */
export function disabledSubSides(
  parent: Field,
  sub: Field,
  parentSides: Record<DirectionalSide, SideState>,
): Record<DirectionalSide, string | undefined> {
  const suffix =
    parent.key === undefined || sub.key === undefined
      ? undefined
      : subFieldSuffix(parent.key, sub.key)
  const group = parent.key === undefined ? undefined : sideGroupOfKey(parent.key)
  const disabled = (side: DirectionalSide) => {
    const value = parentSides[side].value
    if (!isSideOffValue(value)) return undefined
    const allowed =
      group !== undefined &&
      suffix !== undefined &&
      suffixAllowedWhenOff(group, value, suffix.slice(1))
    return allowed ? undefined : value
  }
  return { left: disabled('left'), right: disabled('right') }
}

/** A row of a sided field's block: the directional field, or a sub field under its parent's row (`parent`) */
export type SidedRow = { field: Field; parent?: Field }

/**
 * The rows of a block of the field list when it is a field with a left and a right side (SidedFieldBlock): a group's
 * parent and its sub fields (each sub row knows its parent), or a directional combo with a key on its own. Undefined
 * for any other field, which keeps its own row. The blocks stay at their place in the preset's order.
 */
export function sidedRowsOf(block: DirectionalBlock): SidedRow[] | undefined {
  if (block.kind === 'group') {
    return [
      { field: block.parent },
      ...block.subs.map((sub) => ({ field: sub, parent: block.parent })),
    ]
  }
  const { field } = block
  return field.type === 'directionalCombo' && field.key !== undefined ? [{ field }] : undefined
}

/**
 * The sub fields that a choice of their parent opens: a field of `offered` (the preset's moreFields) that is a sub
 * field of one of the rows (isSubOf) whose side has a value that uses it (not no, none or separate: unusedSides), and
 * that is not a row yet. Parking on a side opens its orientation: the next decision is a row at once, empty, under
 * its parent, without a pick from "Add field". In the order of `offered`.
 */
export function openedSubFields(
  rows: readonly Field[],
  offered: readonly Field[],
  tags: Tags,
  combined?: CombinedTags,
  features?: readonly Tags[],
): Field[] {
  const shown = new Set(rows.map((field) => field.id))
  const opens = (parent: Field) => {
    if (parent.key === undefined) return false
    const sides = sideStates(directionalKeys(parent.key), tags, combined, features)
    const unused = unusedSides(sides)
    const used = (side: DirectionalSide) =>
      (sides[side].value !== undefined || sides[side].mixed !== undefined) && !unused[side]
    return used('left') || used('right')
  }
  return offered.filter(
    (field) =>
      !shown.has(field.id) && rows.some((parent) => isSubOf(parent, field) && opens(parent)),
  )
}

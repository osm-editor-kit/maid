import type { Field } from '@osm-editor-kit/maid-presets'
import { directionalKeys, type DirectionalSide, type SideState } from './directional-logic.ts'

/**
 * The values of a parent's side that make the sub field of that side meaningless (no parking, no cycle
 * lane on that side). A sub field's combo of such a side is disabled. One list for every parent.
 */
export const UNUSED_SIDE_VALUES: readonly string[] = ['separate', 'no', 'none']

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
 * Which sides of a sub field are not used, from the parent's sides (sideStates over the parent's key, as the
 * parent reads them: `parking:both=no` is no on both sides). A side that is mixed over several features is used.
 */
export function unusedSides(
  parentSides: Record<DirectionalSide, SideState>,
): Record<DirectionalSide, boolean> {
  const unused = (state: SideState) =>
    state.value !== undefined && UNUSED_SIDE_VALUES.includes(state.value)
  return { left: unused(parentSides.left), right: unused(parentSides.right) }
}

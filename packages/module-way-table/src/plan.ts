/**
 * Writes as a plan: which ways change, and how (docs/research/way-table.md, 4.5 and 4.8). Pure.
 *
 * A plan is a list of tag changes, one per way that changes, with the stored keys. The UI performs the plan as one
 * undo step (`planChangeTagsEach` in the renderer, or `engine.changeTagsEach`). A plan in which a read-only target
 * would change is refused as a whole, and nothing is written.
 *
 * Writes go to the stored key with the value as typed (the text of a cell is the stored value). A display key that is
 * mirrored is written under its stored name: `mirrorKey` of the display key on a reversed way. Mirrored values are
 * never written.
 */
import { mirrorKey } from './mirror.ts'
import type { Tags } from './types.ts'

/** One way a plan may write to */
export type PlanTarget = {
  readonly id: string
  readonly tags: Tags
  /** The way points against the reference's direction */
  readonly reversed: boolean
  readonly readOnly?: boolean
}

/** The change of one way: `set` writes keys, `remove` deletes them where present */
export type PlanChange = {
  readonly id: string
  readonly set: Readonly<Record<string, string>>
  readonly remove: readonly string[]
}

export type SkipReason = 'direction-dependent' | 'already-set' | 'same-value' | 'no-change'

export type Skipped = { readonly id: string; readonly reason: SkipReason }

export type PlanResult =
  | {
      readonly ok: true
      readonly changes: readonly PlanChange[]
      readonly skipped: readonly Skipped[]
    }
  | { readonly ok: false; readonly reason: 'read-only'; readonly ids: readonly string[] }

/** What a target gets: a change, or a reason to leave it alone */
export type Edit =
  | { readonly set?: Readonly<Record<string, string>>; readonly remove?: readonly string[] }
  | { readonly skip: SkipReason }

/** The stored key of a display key: mirrored on a reversed way, as is otherwise */
export function storedKeyOf(displayKey: string, reversed: boolean): string {
  return reversed ? mirrorKey(displayKey) : displayKey
}

/**
 * Runs an edit on each target. An empty value is a removal. A target whose change would not change its tags is skipped
 * as `no-change`, whether or not it is read-only. A read-only target that would change refuses the whole plan, and
 * nothing is written: the plan names those ids.
 */
export function planEdit(
  targets: readonly PlanTarget[],
  edit: (target: PlanTarget) => Edit,
): PlanResult {
  const changes: PlanChange[] = []
  const skipped: Skipped[] = []
  const refused: string[] = []
  for (const target of targets) {
    const result = edit(target)
    if ('skip' in result) {
      skipped.push({ id: target.id, reason: result.skip })
      continue
    }
    const set: Record<string, string> = {}
    const remove = new Set<string>(result.remove ?? [])
    for (const [key, value] of Object.entries(result.set ?? {})) {
      if (value === '') remove.add(key)
      else if (target.tags[key] !== value) set[key] = value
    }
    const removed = [...remove].filter(
      (key) => target.tags[key] !== undefined && target.tags[key] !== '',
    )
    if (Object.keys(set).length === 0 && removed.length === 0) {
      skipped.push({ id: target.id, reason: 'no-change' })
      continue
    }
    if (target.readOnly) {
      refused.push(target.id)
      continue
    }
    changes.push({ id: target.id, set, remove: removed })
  }
  if (refused.length > 0) return { ok: false, reason: 'read-only', ids: refused }
  return { ok: true, changes, skipped }
}

/**
 * The write of one cell: the value as typed under the stored key of the display key. An empty value (or
 * `undefined`) removes the stored key.
 */
export function planCellWrite(
  target: PlanTarget,
  displayKey: string,
  value: string | undefined,
): PlanResult {
  const key = storedKeyOf(displayKey, target.reversed)
  return planEdit([target], () =>
    value === undefined || value === '' ? { remove: [key] } : { set: { [key]: value } },
  )
}

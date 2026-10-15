/**
 * The writes of the table: plans (plan.ts, carry.ts) turned into history actions, and applied as one undo step.
 * Pure, except `applyPlan`, which performs on the history it is given.
 *
 * A plan that a read-only feature refuses changes nothing: `applyPlan` returns the refusal and performs no action.
 */
import type { Editor } from '@osm-editor-kit/maid-core'
import { type Action, actionChangeTags, type Graph, OsmWay } from '@osm-editor-kit/maid-model'
import {
  type CarryDirection,
  type CarryMode,
  carryTargets,
  planCarry,
  planSetOnAll,
} from './carry.ts'
import type { WayChain } from './chain.ts'
import { type PlanChange, type PlanResult, type PlanTarget, planCellWrite } from './plan.ts'
import type { TableColumn, TableView } from './table.ts'

/** The longest value OSM takes; the cell refuses a longer one */
export const MAX_VALUE_LENGTH = 255

export function targetOf(column: TableColumn): PlanTarget {
  return { id: column.id, tags: column.tags, reversed: column.reversed, readOnly: column.readOnly }
}

/** The targets for the ids, in the order given; an id that is not a column is left out */
export function targetsOf(columns: readonly TableColumn[], ids: readonly string[]): PlanTarget[] {
  const byId = new Map(columns.map((column) => [column.id, column]))
  return ids.flatMap((id) => {
    const column = byId.get(id)
    return column ? [targetOf(column)] : []
  })
}

/** The reference's value for a key, or undefined when the reference lacks it (the reference is never reversed) */
export function referenceValue(
  columns: readonly TableColumn[],
  referenceId: string,
  key: string,
): string | undefined {
  const value = columns.find((column) => column.id === referenceId)?.tags[key]
  return value === undefined || value === '' ? undefined : value
}

/** Set on all: the reference's value on every other column. Undefined when the reference has no value for the key. */
export function setAllPlan(
  columns: readonly TableColumn[],
  referenceId: string,
  key: string,
): PlanResult | undefined {
  const value = referenceValue(columns, referenceId, key)
  if (value === undefined) return undefined
  const targets = columns.filter((column) => column.id !== referenceId).map(targetOf)
  return planSetOnAll({ key, value, targets })
}

export type CarryOptions = {
  readonly direction: CarryDirection
  readonly count: number
  readonly mode: CarryMode
}

/** A carry of the reference's value to the next `count` ways of the chain. Undefined when the reference has no value. */
export function carryPlan(
  chain: WayChain,
  columns: readonly TableColumn[],
  referenceId: string,
  key: string,
  options: CarryOptions,
): PlanResult | undefined {
  const value = referenceValue(columns, referenceId, key)
  if (value === undefined) return undefined
  const ids = carryTargets(chain, options.direction, options.count)
  return planCarry({ key, value, targets: targetsOf(columns, ids), mode: options.mode })
}

/** The plan of the batch that is waiting for a confirmation, if it belongs to this table */
export function pendingPlanOf(
  table: TableView,
  pending: {
    readonly kind: 'carry' | 'set-all'
    readonly referenceId: string
    readonly key: string
  } | null,
  carry: CarryOptions,
): PlanResult | undefined {
  if (!pending || pending.referenceId !== table.referenceId) return undefined
  if (pending.kind === 'set-all') {
    return setAllPlan(table.columns, table.referenceId, pending.key)
  }
  if (!table.chain) return undefined
  return carryPlan(table.chain, table.columns, table.referenceId, pending.key, carry)
}

/** The ids a plan would change (empty when it is refused or changes nothing) */
export function changedIds(plan: PlanResult | undefined): ReadonlySet<string> {
  return new Set(plan?.ok ? plan.changes.map((change) => change.id) : [])
}

/**
 * The stored keys of a column whose tags differ from the base data (the edits of this session). The keys of both
 * sides count, so a removed key is a change too.
 */
export function changedKeysOf(base: Graph, column: TableColumn): ReadonlySet<string> {
  const before = base.hasEntity(column.id)
  if (!before) return new Set()
  const keys = new Set([...Object.keys(before.tags), ...Object.keys(column.tags)])
  return new Set([...keys].filter((key) => (before.tags[key] ?? '') !== (column.tags[key] ?? '')))
}

/** The history actions of a plan's changes: each way gets its tags after the change, one action per way */
export function actionsOf(graph: Graph, changes: readonly PlanChange[]): Action[] {
  const actions: Action[] = []
  for (const change of changes) {
    const entity = graph.hasEntity(change.id)
    if (!(entity instanceof OsmWay)) continue
    const tags: Record<string, string> = { ...entity.tags }
    for (const key of change.remove) delete tags[key]
    Object.assign(tags, change.set)
    actions.push(actionChangeTags(change.id, tags))
  }
  return actions
}

export type ApplyResult =
  | { readonly ok: true; readonly changed: number }
  | { readonly ok: false; readonly ids: readonly string[] }

/**
 * Performs a plan as one undo step. A refused plan (a read-only feature) performs nothing and returns the ids that
 * refused it. A plan that changes nothing is not committed.
 */
export function applyPlan(
  history: Editor['history'],
  graph: Graph,
  plan: PlanResult,
  annotation: string,
  selectedIDs: readonly string[],
): ApplyResult {
  if (!plan.ok) return { ok: false, ids: plan.ids }
  const actions = actionsOf(graph, plan.changes)
  if (actions.length === 0) return { ok: true, changed: 0 }
  history.perform(...actions)
  history.commit({ annotation, selectedIDs: [...selectedIDs] })
  return { ok: true, changed: actions.length }
}

/** The plan of one cell: the value under the display key, written to the stored key (plan.ts) */
export function cellPlan(
  column: TableColumn,
  displayKey: string,
  value: string | undefined,
): PlanResult {
  return planCellWrite(targetOf(column), displayKey, value)
}

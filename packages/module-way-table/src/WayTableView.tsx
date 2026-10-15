import type { Editor } from '@osm-editor-kit/maid-core'
import type { Graph } from '@osm-editor-kit/maid-model'
import type { DockViewProps } from '@osm-editor-kit/maid-ui'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { m } from './messages.ts'
import type { PlanResult } from './plan.ts'
import { buildRows } from './rows.ts'
import { buildTable, type HintReason, type TableView } from './table.ts'
import {
  useWayTableActions,
  useWayTableCarry,
  useWayTableChoices,
  useWayTableFolded,
  useWayTableLimit,
  useWayTableOnlyDiffering,
  useWayTablePending,
  type WayTableStore,
} from './way-table-store.ts'
import { WayTableBar } from './WayTableBar.tsx'
import { WayTableGrid } from './WayTableGrid.tsx'
import { WayTableLegend } from './WayTableLegend.tsx'
import { changedKeysOf, changedIds, pendingPlanOf, applyPlan } from './write.ts'

/**
 * The dock view's props, and what the module adds: the store, and `readOnly`, which the shell passes when it knows the
 * features a filter makes read-only. Without it every feature is read-only, so the table writes nothing.
 */
export type WayTableViewProps = DockViewProps & {
  readonly store: WayTableStore
  readonly readOnly?: ((id: string) => boolean) | undefined
}

/** The history's staging graph, read as it changes (an external store: the React Compiler keeps it out of memos) */
function useStagingGraph(editor: Editor): Graph {
  return useSyncExternalStore(
    (listener) => {
      const offs = [
        editor.history.on('stagingchange', listener),
        editor.history.on('stablechange', listener),
        editor.history.on('historyjump', listener),
      ]
      return () => offs.forEach((off) => off())
    },
    () => editor.history.staging.graph,
  )
}

function hintText(reason: HintReason): string {
  switch (reason) {
    case 'node':
      return m.way_table_hint_node()
    case 'relation':
      return m.way_table_hint_relation()
    case 'missing':
      return m.way_table_hint_missing()
    case 'none':
      return m.way_table_hint_none()
  }
}

function orderText(order: TableView['order']): string | undefined {
  if (order === 'chain') return m.way_table_order_chain()
  if (order === 'axis') return m.way_table_order_axis()
  if (order === 'selection') return m.way_table_order_selection()
  return undefined
}

/**
 * The way table in the dock: the selection's chain (or its buildings, or several selected features) as columns, the
 * keys as rows, and the cells as the editor's own tags. Nothing is computed by the dock's other tabs; the table reads the
 * staging graph and writes through the history, one undo step per change.
 */
export function WayTableView(props: WayTableViewProps) {
  const { editor, select, selected, highlight, store, readOnly } = props
  const graph = useStagingGraph(editor)
  const reference = selected[0] ?? ''
  const limit = useWayTableLimit(store, reference)
  const choices = useWayTableChoices(store, reference)
  const onlyDiffering = useWayTableOnlyDiffering(store)
  const folded = useWayTableFolded(store)
  const pending = useWayTablePending(store)
  const carry = useWayTableCarry(store)
  const actions = useWayTableActions(store)
  const [status, setStatus] = useState<{
    readonly reference: string
    readonly text: string
  } | null>(null)

  // the highlight is cleared when the table goes; the ref keeps the latest function without a new effect each render
  const highlightRef = useRef(highlight)
  useEffect(() => {
    highlightRef.current = highlight
  })
  useEffect(() => () => highlightRef.current(null), [])

  const choose = useMemo(() => new Map(Object.entries(choices)), [choices])
  const table = useMemo(
    () => buildTable(graph, selected, { maxPerSide: limit, choose, isReadOnly: readOnly }),
    [graph, selected, limit, choose, readOnly],
  )
  const groups = useMemo(
    () =>
      table.kind === 'table'
        ? buildRows(table.columns, { referenceId: table.referenceId, onlyDiffering })
        : [],
    [table, onlyDiffering],
  )
  const base = editor.history.base.graph
  const edited = useMemo(() => {
    const result = new Map<string, ReadonlySet<string>>()
    if (table.kind === 'table') {
      for (const column of table.columns) result.set(column.id, changedKeysOf(base, column))
    }
    return result
  }, [table, base])
  const anyEdited = [...edited.values()].some((keys) => keys.size > 0)

  if (table.kind === 'hint') {
    return (
      <p className="p-3 text-sm text-zinc-600 dark:text-zinc-300" role="status">
        {hintText(table.reason)}
      </p>
    )
  }

  const plan = pendingPlanOf(table, pending, carry)
  const waiting = pending !== null && pending.referenceId === table.referenceId
  const preview = waiting && pending ? { rowKey: pending.key, ids: changedIds(plan) } : null
  const shownStatus = status?.reference === reference ? status.text : null
  const hasChoices = Object.keys(choices).length > 0

  function apply(result: PlanResult, annotation: string) {
    const outcome = applyPlan(editor.history, graph, result, annotation, selected)
    if (outcome.ok) {
      setStatus(null)
      actions.endPending()
    } else {
      setStatus({ reference, text: m.way_table_refused({ count: outcome.ids.length }) })
    }
  }

  const order = orderText(table.order)
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 p-2 text-sm text-zinc-950 dark:text-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <WayTableLegend edited={anyEdited} />
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={onlyDiffering}
            onChange={actions.toggleOnlyDiffering}
            className="size-3.5 accent-blue-600"
          />
          {m.way_table_only_differing()}
        </label>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{m.way_table_edit_hint()}</span>
        {hasChoices ? (
          <button
            type="button"
            className="text-xs text-blue-700 underline focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-blue-300"
            onClick={() => actions.forgetChoices(reference)}
          >
            {m.way_table_forget_choices()}
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5 text-xs text-zinc-600 dark:text-zinc-300">
        {readOnly === undefined ? <span>{m.way_table_editing_off()}</span> : null}
        {table.mode === 'way' && table.columns.length === 1 ? (
          <span>{m.way_table_lone()}</span>
        ) : null}
        {order !== undefined ? <span>{order}</span> : null}
        {table.hidden > 0 ? (
          <span>
            {m.way_table_showing_of({
              shown: table.columns.length,
              count: table.columns.length + table.hidden,
            })}
          </span>
        ) : null}
        {table.notWays > 0 ? <span>{m.way_table_not_ways({ count: table.notWays })}</span> : null}
        {shownStatus ? (
          <span role="alert" className="font-medium text-red-700 dark:text-red-300">
            {shownStatus}
          </span>
        ) : null}
      </div>
      {waiting && pending ? (
        <WayTableBar
          kind={pending.kind}
          rowKey={pending.key}
          plan={plan}
          limit={limit}
          settings={carry}
          onSettings={actions.setCarry}
          onApply={apply}
          onCancel={actions.endPending}
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <WayTableGrid
          table={table}
          graph={graph}
          groups={groups}
          folded={folded}
          edited={edited}
          preview={preview}
          limit={limit}
          actions={actions}
          onApply={apply}
          onSelect={(id) => select(id)}
          onHighlight={highlight}
        />
      </div>
    </div>
  )
}

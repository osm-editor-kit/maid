import type { Editor } from '@osm-editor-kit/maid-core'
import type { Graph } from '@osm-editor-kit/maid-model'
import type { DockViewProps } from '@osm-editor-kit/maid-ui'
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { m } from './messages.ts'
import type { PlanResult } from './plan.ts'
import { buildRows } from './rows.ts'
import {
  buildTable,
  changeKeepsTable,
  type HintReason,
  referenceOf,
  type TableView,
} from './table.ts'
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
 * The dock view's props, and what the module adds: the store. The dock passes `readOnly` (the features a filter makes
 * read-only), so the table never writes a feature that a filter protects.
 */
export type WayTableViewProps = DockViewProps & {
  readonly store: WayTableStore
}

/**
 * The staging graph as the table reads it. It moves on only when a change can change the table (`changeKeepsTable`), so
 * a drag of a node the table does not use rebuilds nothing: the snapshot is the graph the table was last given, and a
 * change that keeps the table returns that graph again (the same value, so no render). An external store: the graph is
 * read from the history.
 */
function useTableGraph(editor: Editor, selected: readonly string[]): Graph {
  const { history } = editor
  // the graph the table was last given: only a change that moves the table on replaces it
  const given = useRef(history.staging.graph)
  // stable for one history: a new subscribe function would make the hook unsubscribe and subscribe on every render
  const subscribe = useCallback(
    (listener: () => void) => {
      const offs = [
        history.on('stagingchange', listener),
        history.on('stablechange', listener),
        history.on('historyjump', listener),
      ]
      return () => offs.forEach((off) => off())
    },
    [history],
  )
  return useSyncExternalStore(subscribe, () => {
    const next = history.staging.graph
    if (!changeKeepsTable(given.current, next, selected)) given.current = next
    return given.current
  })
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
  const graph = useTableGraph(editor, selected)
  // the reference is the table's own: the first selected way, whatever is selected before it
  const reference = referenceOf(graph, selected) ?? ''
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

  // a batch waits for the table it was made for: when the reference changes, it ends and does not come back with it
  useEffect(() => {
    actions.endPending()
  }, [reference, actions])

  // the highlight is cleared when the table goes; the effect event reads the latest `highlight` without re-running it
  const clearHighlight = useEffectEvent(() => highlight(null))
  useEffect(() => () => clearHighlight(), [])

  const choose = useMemo(() => new Map(Object.entries(choices)), [choices])
  const built = useMemo(
    () => buildTable(graph, selected, { maxPerSide: limit, choose }),
    [graph, selected, limit, choose],
  )
  // Read-only is asked on every render, since a filter can change it without a change of the graph. The answers are a
  // key, so the table is only re-marked when one of them changes.
  const readOnlyKey =
    built.kind === 'table'
      ? built.columns.map((column) => (readOnly(column.id) ? '1' : '0')).join('')
      : ''
  const table = useMemo(
    () =>
      built.kind !== 'table'
        ? built
        : {
            ...built,
            columns: built.columns.map((column, index) => ({
              ...column,
              readOnly: readOnlyKey[index] === '1',
            })),
          },
    [built, readOnlyKey],
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

import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/16/solid'
import type { Graph } from '@osm-editor-kit/maid-model'
import { type KeyboardEvent, useMemo, useState } from 'react'
import type { Cell } from './cell-state.ts'
import { REFERENCE_HEADER_CLASS } from './cell-tone.ts'
import { m } from './messages.ts'
import { type PlanResult, storedKeyOf } from './plan.ts'
import type { GroupId, Row, RowGroup } from './rows.ts'
import type { TableColumn, TableView } from './table.ts'
import type { Direction } from './types.ts'
import type { WayTableActions } from './way-table-store.ts'
import { WayTableCell } from './WayTableCell.tsx'
import { WayTableEnd } from './WayTableEnd.tsx'
import { cellPlan, setAllPlan } from './write.ts'

export type WayTableGridProps = {
  readonly table: TableView
  readonly graph: Graph
  readonly groups: readonly RowGroup[]
  readonly folded: Readonly<Partial<Record<GroupId, boolean>>>
  /** The stored keys changed in this session, per column id */
  readonly edited: ReadonlyMap<string, ReadonlySet<string>>
  /** The batch that waits for a confirmation: its row and the cells it would change */
  readonly preview: { readonly rowKey: string; readonly ids: ReadonlySet<string> } | null
  readonly limit: number
  readonly actions: WayTableActions
  readonly onApply: (plan: PlanResult, annotation: string) => void
  readonly onSelect: (id: string) => void
  readonly onHighlight: (ids: readonly string[] | null) => void
}

type Slot =
  | { readonly kind: 'key' }
  | { readonly kind: 'end'; readonly side: Direction }
  | { readonly kind: 'way'; readonly column: TableColumn }

const STEPS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

const GROUP_NAME: Readonly<Record<GroupId, () => string>> = {
  name: () => m.way_table_group_name(),
  road: () => m.way_table_group_road(),
  lanes: () => m.way_table_group_lanes(),
  parking: () => m.way_table_group_parking(),
  cycling: () => m.way_table_group_cycling(),
  footway: () => m.way_table_group_footway(),
  'water-rail': () => m.way_table_group_water_rail(),
  building: () => m.way_table_group_building(),
  other: () => m.way_table_group_other(),
}

/** The cell key of the first cell on screen: where the Tab key lands when no cell was used yet */
function firstCellKey(
  groups: readonly RowGroup[],
  folded: WayTableGridProps['folded'],
  columns: readonly TableColumn[],
): string | undefined {
  const group = groups.find((item) => !folded[item.id] && item.rows.length > 0)
  const row = group?.rows[0]
  const column = columns[0]
  return row && column ? cellKey(row.key, column.id) : undefined
}

function cellKey(rowKey: string, columnId: string): string {
  return `${rowKey}\u0000${columnId}`
}

/** Moves the focus one cell in a direction, across the visible rows (a folded group has none) */
function moveFocus(
  table: HTMLElement,
  from: HTMLTableCellElement,
  [dRow, dCol]: readonly [number, number],
) {
  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tr[data-row-key]'))
  const row = from.parentElement
  const r = rows.findIndex((item) => item === row)
  if (r < 0) return
  const cellsOf = (item: HTMLTableRowElement) =>
    Array.from(item.querySelectorAll<HTMLTableCellElement>('td[data-cell]'))
  const c = cellsOf(rows[r] as HTMLTableRowElement).indexOf(from)
  const nextRow = rows[Math.min(rows.length - 1, Math.max(0, r + dRow))]
  if (!nextRow) return
  const cells = cellsOf(nextRow)
  const next = cells[Math.min(cells.length - 1, Math.max(0, c + dCol))]
  next?.focus()
}

/**
 * The table: a header with one column per way (and the ends of the chain), one group per heading, one row per key.
 * The key column sticks to the left and the table scrolls sideways. Arrows move between cells, Escape leaves a cell.
 */
export function WayTableGrid(props: WayTableGridProps) {
  const {
    table,
    graph,
    groups,
    folded,
    edited,
    preview,
    limit,
    actions,
    onApply,
    onSelect,
    onHighlight,
  } = props
  const [active, setActive] = useState<string | null>(null)
  const chain = table.chain
  const referenceId = table.referenceId
  // "Set on all" for every row, made once per table: the grid renders again on each focus, and a plan is not free
  const setAllByRow = useMemo(() => {
    const plans = new Map<string, PlanResult | undefined>()
    for (const group of groups) {
      for (const row of group.rows) {
        const value = row.cells[referenceId]?.value
        plans.set(
          row.key,
          value !== undefined ? setAllPlan(table.columns, referenceId, row.key) : undefined,
        )
      }
    }
    return plans
  }, [groups, table, referenceId])

  const slots: Slot[] = [{ kind: 'key' }]
  if (chain) slots.push({ kind: 'end', side: 'backward' })
  for (const column of table.columns) slots.push({ kind: 'way', column })
  if (chain) slots.push({ kind: 'end', side: 'forward' })
  const span = slots.length
  const tabbable = active ?? firstCellKey(groups, folded, table.columns)

  function commitCell(column: TableColumn, rowKey: string, value: string | undefined) {
    const annotation =
      value === undefined
        ? m.way_table_clear_annotation({ key: rowKey, way: column.label })
        : m.way_table_edit_annotation({ key: rowKey, way: column.label })
    onApply(cellPlan(column, rowKey, value), annotation)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    const target = event.target
    if (!(target instanceof HTMLTableCellElement) || !target.matches('td[data-cell]')) return
    if (event.key === 'Escape') {
      target.blur()
      return
    }
    const step = STEPS[event.key]
    if (!step) return
    event.preventDefault()
    moveFocus(event.currentTarget, target, step)
  }

  function renderRow(row: Row) {
    const referenceCell: Cell | undefined = row.cells[referenceId]
    const referenceValue = referenceCell?.value
    const setAll = setAllByRow.get(row.key)
    const setAllCount = setAll?.ok ? setAll.changes.length : 0
    // a read-only way that would change refuses the batch: the button stays, disabled, with the reason beside it
    const setAllRefused = setAll && !setAll.ok ? setAll.ids.length : 0
    return (
      <tr key={row.key} data-row-key={row.key} className="group/row">
        {slots.map((slot) => {
          if (slot.kind === 'key') {
            return (
              <th
                key="key"
                scope="row"
                className="sticky left-0 z-10 max-w-56 border-r border-b border-zinc-950/10 bg-white px-2 py-1.5 text-left align-top font-normal dark:border-white/10 dark:bg-zinc-900"
              >
                <div className="flex items-center gap-1">
                  <span className="truncate font-mono text-xs" title={row.key}>
                    {row.key}
                  </span>
                  {row.differs ? (
                    <span aria-hidden className="text-amber-600 dark:text-amber-400">
                      •
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {setAllCount > 0 || setAllRefused > 0 ? (
                    <button
                      type="button"
                      disabled={setAllRefused > 0}
                      className="rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-900 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                      onClick={() =>
                        actions.startPending({ kind: 'set-all', referenceId, key: row.key })
                      }
                    >
                      {m.way_table_set_all({ count: setAllCount || setAllRefused })}
                    </button>
                  ) : null}
                  {setAllRefused > 0 ? (
                    <span className="text-[10px] text-amber-800 dark:text-amber-300">
                      {m.way_table_set_all_read_only({ count: setAllRefused })}
                    </span>
                  ) : null}
                  {chain && referenceValue !== undefined ? (
                    <button
                      type="button"
                      className="rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-900 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                      onClick={() =>
                        actions.startPending({ kind: 'carry', referenceId, key: row.key })
                      }
                    >
                      {m.way_table_carry()}
                    </button>
                  ) : null}
                </div>
              </th>
            )
          }
          if (slot.kind === 'end') {
            return (
              <td
                key={slot.side}
                aria-hidden
                className="border-r border-b border-zinc-950/10 bg-zinc-50 dark:border-white/10 dark:bg-zinc-900/60"
              />
            )
          }
          const column = slot.column
          const cell: Cell = row.cells[column.id] ?? { state: 'empty', dependent: false }
          return (
            <WayTableCell
              key={column.id}
              displayKey={row.key}
              column={column}
              cell={cell}
              referenceValue={referenceValue}
              edited={edited.get(column.id)?.has(storedKeyOf(row.key, column.reversed)) ?? false}
              previewing={preview?.rowKey === row.key && preview.ids.has(column.id)}
              tabbable={tabbable === cellKey(row.key, column.id)}
              onActivate={() => setActive(cellKey(row.key, column.id))}
              onCommit={(value) => commitCell(column, row.key, value)}
            />
          )
        })}
      </tr>
    )
  }

  return (
    <table
      className="w-max min-w-full table-fixed border-separate border-spacing-0 text-left"
      onKeyDown={onKeyDown}
    >
      <thead className="sticky top-0 z-20 bg-white dark:bg-zinc-900">
        <tr>
          {slots.map((slot) => {
            if (slot.kind === 'key') {
              return (
                <th
                  key="key"
                  scope="col"
                  className="sticky top-0 left-0 z-30 w-44 border-r border-b border-zinc-950/10 bg-white px-2 py-1.5 text-left font-normal dark:border-white/10 dark:bg-zinc-900"
                >
                  {chain ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={m.way_table_previous_way()}
                        title={m.way_table_previous_way()}
                        disabled={chain.centerIndex === 0}
                        className="rounded-md p-0.5 text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        onClick={() => {
                          const previous = chain.ways[chain.centerIndex - 1]
                          if (previous) onSelect(previous.id)
                        }}
                      >
                        <ChevronLeftIcon className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={m.way_table_next_way()}
                        title={m.way_table_next_way()}
                        disabled={chain.centerIndex >= chain.ways.length - 1}
                        className="rounded-md p-0.5 text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        onClick={() => {
                          const next = chain.ways[chain.centerIndex + 1]
                          if (next) onSelect(next.id)
                        }}
                      >
                        <ChevronRightIcon className="size-4" />
                      </button>
                    </div>
                  ) : null}
                </th>
              )
            }
            if (slot.kind === 'end') {
              return (
                <th
                  key={slot.side}
                  scope="col"
                  className="w-44 border-r border-b border-zinc-950/10 p-2 text-left font-normal dark:border-white/10"
                >
                  {chain ? (
                    <WayTableEnd
                      side={slot.side}
                      chain={chain}
                      referenceId={referenceId}
                      graph={graph}
                      limit={limit}
                      choosable={table.mode === 'way'}
                      actions={actions}
                      onHighlight={onHighlight}
                    />
                  ) : null}
                </th>
              )
            }
            const column = slot.column
            const isReference = column.id === referenceId
            return (
              <th
                key={column.id}
                scope="col"
                className={`w-44 border-r border-b border-zinc-950/10 px-2 py-1.5 text-left align-top font-normal dark:border-white/10 ${isReference ? REFERENCE_HEADER_CLASS : 'bg-white dark:bg-zinc-900'}`}
              >
                <div className="flex min-w-0 items-center gap-1">
                  <button
                    type="button"
                    title={column.id}
                    aria-label={m.way_table_select_way({ way: column.label })}
                    className="min-w-0 truncate text-left font-medium text-zinc-950 hover:underline focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-white"
                    onClick={() => onSelect(column.id)}
                    onMouseEnter={() => onHighlight([column.id])}
                    onMouseLeave={() => onHighlight(null)}
                    onFocus={() => onHighlight([column.id])}
                    onBlur={() => onHighlight(null)}
                  >
                    {column.label}
                  </button>
                  {column.reversed ? (
                    <span
                      className="shrink-0 text-zinc-500 dark:text-zinc-400"
                      title={m.way_table_reversed()}
                    >
                      ⇄
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
                  {isReference ? (
                    <span className="font-medium text-blue-700 dark:text-blue-300">
                      {m.way_table_reference()}
                    </span>
                  ) : null}
                  {column.readOnly ? <span>{m.way_table_read_only_short()}</span> : null}
                  <span className="truncate font-mono">{column.id}</span>
                </div>
              </th>
            )
          })}
        </tr>
      </thead>
      {groups.map((group) => {
        const isFolded = folded[group.id] === true
        return (
          <tbody key={group.id}>
            <tr>
              <th
                colSpan={span}
                scope="rowgroup"
                className="sticky left-0 border-b border-zinc-950/10 bg-zinc-100 px-2 py-1 text-left dark:border-white/10 dark:bg-zinc-800"
              >
                <button
                  type="button"
                  aria-expanded={!isFolded}
                  aria-label={m.way_table_group_toggle({ group: GROUP_NAME[group.id]() })}
                  className="flex items-center gap-1 text-xs font-semibold text-zinc-800 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-zinc-100"
                  onClick={() => actions.toggleGroup(group.id)}
                >
                  {isFolded ? (
                    <ChevronRightIcon className="size-3.5" />
                  ) : (
                    <ChevronDownIcon className="size-3.5" />
                  )}
                  <span>{GROUP_NAME[group.id]()}</span>
                  <span className="font-normal text-zinc-500 dark:text-zinc-400">
                    {group.differing > 0
                      ? m.way_table_group_differ({ count: group.differing })
                      : ''}
                  </span>
                </button>
              </th>
            </tr>
            {isFolded ? null : group.rows.map((row) => renderRow(row))}
          </tbody>
        )
      })}
    </table>
  )
}

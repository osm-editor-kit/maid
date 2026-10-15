import type { Editor } from '@osm-editor-kit/maid-core'
import { actionChangeTags } from '@osm-editor-kit/maid-model'
import {
  notify,
  Tooltip,
  type FieldFocus,
  type InspectorSectionProps,
} from '@osm-editor-kit/maid-ui'
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { PARKING_ICONS, type ParkingIconName } from '../icons/index.ts'
import { m } from '../messages.ts'
import type { Side } from '../sides.ts'
import {
  cellState,
  focusKeyOf,
  nextIndex,
  planCell,
  type CellState,
  type RoadTags,
} from './quick-tag-logic.ts'
import {
  QUICK_TAG_ROWS,
  QUICK_TAGS,
  sideNameOf,
  type QuickTag,
  type QuickTagRow,
} from './quick-tags.ts'

/** A selected road: its id and tags as the inspector has them, and whether a filter makes it read-only */
export type QuickTagRoad = RoadTags & { readOnly: boolean }

export type QuickTagsProps = {
  /** The selected roads. The caller passes their tags, so the buttons show the data as it is on render. */
  roads: readonly QuickTagRoad[]
  /** Writes go through its history: one undo step per click */
  editor: Editor
  /**
   * Told when a button gets the pointer or the keyboard focus (with the side it is about), and with null when it
   * leaves. The map then shows that side of the road. Absent for several roads: the shell shows the side of one.
   */
  onFieldFocus?: (focus: FieldFocus | null) => void
}

/** The grid has three columns: left, right, both */
const COLUMNS = ['left', 'right', 'both'] as const

/**
 * The cells of the grid, by `row/side`: the buttons of one row and side, in the order a click goes through them.
 * A cell with one button is a toggle.
 */
const CELLS = new Map<string, QuickTag[]>()
for (const tag of QUICK_TAGS) {
  const key = `${tag.row}/${tag.side}`
  CELLS.set(key, [...(CELLS.get(key) ?? []), tag])
}

const GRID = 'grid grid-cols-[minmax(0,1fr)_repeat(3,2.25rem)] items-center gap-x-1 gap-y-1'
const CELL =
  'relative grid size-9 shrink-0 place-items-center rounded-md bg-white p-0.5 inset-ring-1 inset-ring-zinc-950/10 hover:bg-zinc-50 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-40 aria-pressed:bg-blue-50 aria-pressed:inset-ring-2 aria-pressed:inset-ring-blue-500 aria-[pressed=mixed]:inset-ring-2 aria-[pressed=mixed]:inset-ring-blue-300 dark:bg-zinc-800 dark:inset-ring-white/10 dark:hover:bg-zinc-700 dark:aria-pressed:bg-blue-500/20 dark:aria-pressed:inset-ring-blue-400'

function iconUrl(name: string | undefined) {
  return name !== undefined && name in PARKING_ICONS
    ? PARKING_ICONS[name as ParkingIconName]
    : undefined
}

/** The history annotation of a click: the name of the undo step, in the page's language */
function annotationOf(tag: QuickTag, on: boolean) {
  if (tag.clearSide)
    return tag.clearSide === 'left'
      ? m.quick_annotation_clear_left()
      : tag.clearSide === 'right'
        ? m.quick_annotation_clear_right()
        : m.quick_annotation_clear_both()
  return on
    ? m.quick_annotation_set({ label: tag.label })
    : m.quick_annotation_remove({ label: tag.label })
}

/**
 * The name of a cycling cell for the tooltip and screen readers: its heading, its side, the value it has (or that
 * it is not set, or that the selected roads differ), and what the next click does.
 */
function cycleName(row: QuickTagRow, side: Side, cell: readonly QuickTag[], state: CellState) {
  const next = nextIndex(state.current, cell.length)
  const nextName = next === undefined ? m.quick_next_remove() : (cell[next]?.name ?? '')
  const heading = row.label
  const sideName = sideNameOf(side)
  if (state.mixed) return m.quick_cell_mixed({ heading, side: sideName, next: nextName })
  const value = state.current === undefined ? undefined : cell[state.current]
  if (!value) return m.quick_cell_unset({ heading, side: sideName, next: nextName })
  return m.quick_cell_label({ heading, side: sideName, value: value.name, next: nextName })
}

/** A trash can for the clearing cells, drawn here: the sprites have no bin in this style */
function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-zinc-700 dark:text-zinc-300"
    >
      <path d="M4 7h16M9 7V4.5h6V7M6 7l1 12.5h10L18 7M10 11v5M14 11v5" />
    </svg>
  )
}

/** The buttons that set the parking tags of the selected road(s): a grid of cells (left, right, both) with one row per group */
export function QuickTags({ roads, editor, onFieldFocus }: QuickTagsProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  // roving tab stop: the grid is one tab stop, the arrow keys move within it
  const [active, setActive] = useState(0)
  if (roads.length === 0) return null

  const readOnly = roads.filter((road) => road.readOnly).length
  const disabled = readOnly > 0
  const tags = roads.map((road) => road.tags)

  const showSide = (tag: QuickTag) =>
    onFieldFocus?.({
      fieldId: 'parking-quick-tags',
      key: focusKeyOf(tag),
      value: undefined,
      side: tag.side,
    })
  const hideSide = () => onFieldFocus?.(null)

  /** One change for all roads, one undo step. A refusal shows a toast and writes nothing. */
  const press = (cell: readonly QuickTag[]) => {
    if (readOnly > 0) {
      notify.failed(m.quick_read_only({ readOnly, total: roads.length }))
      return
    }
    // the tags as the history has them now, not as they were on the last render
    const graph = editor.history.staging.graph
    const current: RoadTags[] = []
    for (const road of roads) {
      const entity = graph.hasEntity(road.id)
      if (!entity) {
        notify.failed(m.quick_entity_missing())
        return
      }
      current.push({ id: road.id, tags: entity.tags })
    }
    const plan = planCell(current, cell)
    if (!plan || plan.changes.length === 0) return
    editor.history.perform(
      ...plan.changes.map((change) => actionChangeTags(change.id, change.tags)),
    )
    editor.history.commit({
      annotation: annotationOf(plan.tag, plan.on),
      selectedIDs: plan.changes.map((change) => change.id),
    })
  }

  const moveTo = (index: number) => {
    setActive(index)
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${index}"]`)?.focus()
  }
  const onGridKey = (event: KeyboardEvent, index: number) => {
    const row = Math.floor(index / COLUMNS.length)
    const col = index % COLUMNS.length
    const last = COLUMNS.length - 1
    const lastRow = QUICK_TAG_ROWS.length - 1
    let next: number
    switch (event.key) {
      case 'ArrowRight':
        next = row * COLUMNS.length + Math.min(col + 1, last)
        break
      case 'ArrowLeft':
        next = row * COLUMNS.length + Math.max(col - 1, 0)
        break
      case 'ArrowDown':
        next = Math.min(row + 1, lastRow) * COLUMNS.length + col
        break
      case 'ArrowUp':
        next = Math.max(row - 1, 0) * COLUMNS.length + col
        break
      case 'Home':
        next = row * COLUMNS.length
        break
      case 'End':
        next = row * COLUMNS.length + last
        break
      default:
        return
    }
    event.preventDefault()
    moveTo(next)
  }

  /** The cell of a row and side: a clearing button, or a button that cycles (or is a toggle) */
  const renderCell = (row: QuickTagRow, side: Side, index: number) => {
    const key = `${row.id}-${side}`
    const cell = CELLS.get(`${row.id}/${side}`)
    const first = cell?.[0]
    if (!cell || !first) return <span key={key} />
    const tabIndex = active === index ? 0 : -1
    const onFocus = () => {
      setActive(index)
      showSide(first)
    }
    if (first.clearSide) {
      const name = first.label
      return (
        <Tooltip key={key} label={name} placement="top">
          <button
            type="button"
            data-cell={index}
            aria-label={name}
            disabled={disabled}
            tabIndex={tabIndex}
            onFocus={onFocus}
            onBlur={hideSide}
            onPointerEnter={() => showSide(first)}
            onPointerLeave={hideSide}
            onKeyDown={(event) => onGridKey(event, index)}
            onClick={() => press(cell)}
            className={CELL}
          >
            <TrashIcon />
          </button>
        </Tooltip>
      )
    }
    const state = cellState(tags, cell)
    const shown = state.current === undefined ? undefined : cell[state.current]
    const url = iconUrl((shown ?? first).icon)
    const name = row.cycles ? cycleName(row, side, cell, state) : first.label
    return (
      <Tooltip key={key} label={name} placement="top">
        <button
          type="button"
          data-cell={index}
          aria-label={name}
          aria-pressed={state.pressed === 'mixed' ? 'mixed' : state.pressed === 'on'}
          disabled={disabled}
          tabIndex={tabIndex}
          onFocus={onFocus}
          onBlur={hideSide}
          onPointerEnter={() => showSide(first)}
          onPointerLeave={hideSide}
          onKeyDown={(event) => onGridKey(event, index)}
          onClick={() => press(cell)}
          className={CELL}
        >
          {url ? (
            <img
              src={url}
              alt=""
              width={28}
              height={28}
              draggable={false}
              className={
                shown ? 'size-7 object-contain' : 'size-7 object-contain opacity-40 grayscale'
              }
            />
          ) : null}
        </button>
      </Tooltip>
    )
  }

  return (
    <div role="group" aria-label={m.quick_group_label()} ref={gridRef} className={GRID}>
      <span />
      {COLUMNS.map((side) => (
        <span
          key={side}
          className="truncate text-center text-[11px] text-zinc-500 dark:text-zinc-400"
        >
          {side === 'left' ? m.side_left() : side === 'right' ? m.side_right() : m.side_both()}
        </span>
      ))}
      {QUICK_TAG_ROWS.flatMap((row, rowIndex) => [
        // a thin line between the cycling groups, the lane toggle and the clearing row
        row.id === 'lane' || row.id === 'clear' ? (
          <div
            key={`${row.id}-separator`}
            role="presentation"
            className="col-span-4 border-t border-zinc-950/10 dark:border-white/10"
          />
        ) : null,
        <span
          key={`${row.id}-label`}
          className="min-w-0 truncate text-xs font-medium text-zinc-700 dark:text-zinc-300"
        >
          {row.label}
        </span>,
        ...COLUMNS.map((side, colIndex) =>
          renderCell(row, side, rowIndex * COLUMNS.length + colIndex),
        ),
      ])}
    </div>
  )
}

/** The inspector section around QuickTags (`inspector.section`): one selected way, or several (`entities`) */
export function QuickTagsSection({
  entity,
  entities,
  editor,
  onFieldFocus,
}: InspectorSectionProps): ReactNode {
  // the highlight of a side ends with the section (another selection, or the road is gone)
  const clearFocus = useEffectEvent(() => onFieldFocus?.(null))
  useEffect(() => () => clearFocus(), [])
  const roads = (entities ?? [entity]).map((item) => ({
    id: item.id,
    tags: item.tags,
    readOnly: item.readOnly,
  }))
  return <QuickTags roads={roads} editor={editor} onFieldFocus={onFieldFocus} />
}

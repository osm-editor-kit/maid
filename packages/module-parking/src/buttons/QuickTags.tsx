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
import { pick } from '../language.ts'
import {
  clickIsOn,
  focusKeyOf,
  planQuickTag,
  pressedState,
  type PressedState,
  type RoadTags,
} from './quick-tag-logic.ts'
import { QUICK_TAG_ROWS, QUICK_TAGS, type QuickTag } from './quick-tags.ts'

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

/** One button per row and column, by `row/side` */
const CELLS = new Map(
  QUICK_TAGS.filter((tag) => tag.row !== undefined).map((tag): [string, QuickTag] => [
    `${tag.row}/${tag.side}`,
    tag,
  ]),
)
/** The combined buttons: the ones without a grid row */
const COMBINED = QUICK_TAGS.filter((tag) => tag.row === undefined)

const GRID = 'grid grid-cols-[minmax(0,1fr)_repeat(3,2.25rem)] items-center gap-x-1 gap-y-1'
const CELL =
  'relative grid size-9 shrink-0 place-items-center rounded-md bg-white p-0.5 inset-ring-1 inset-ring-zinc-950/10 hover:bg-zinc-50 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-40 aria-pressed:bg-blue-50 aria-pressed:inset-ring-2 aria-pressed:inset-ring-blue-500 aria-[pressed=mixed]:inset-ring-2 aria-[pressed=mixed]:inset-ring-blue-300 dark:bg-zinc-800 dark:inset-ring-white/10 dark:hover:bg-zinc-700 dark:aria-pressed:bg-blue-500/20 dark:aria-pressed:inset-ring-blue-400'
const LIST_BUTTON =
  'flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-zinc-800 hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:text-zinc-400 aria-pressed:bg-blue-50 aria-pressed:text-blue-700 dark:text-zinc-200 dark:hover:bg-white/10 dark:aria-pressed:bg-blue-500/20 dark:aria-pressed:text-blue-300'

/** The tags of each road, for the logic that takes them alone */
function tagsOf(roads: readonly QuickTagRoad[]) {
  return roads.map((road) => road.tags)
}

function iconUrl(name: string | undefined) {
  return name !== undefined && name in PARKING_ICONS
    ? PARKING_ICONS[name as ParkingIconName]
    : undefined
}

/** The history annotation of a click, in English like the other annotations */
function annotationOf(tag: QuickTag, on: boolean) {
  if (tag.clearSide) return `Clear the parking tags of the ${tag.clearSide} side`
  return `${on ? 'Set' : 'Remove'} parking: ${tag.label}`
}

/** The buttons that set the parking tags of the selected road(s): a grid of icons (left, right, both) and the combined ones */
export function QuickTags({ roads, editor, onFieldFocus }: QuickTagsProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  // roving tab stop: the grid is one tab stop, the arrow keys move within it
  const [active, setActive] = useState(0)
  if (roads.length === 0) return null

  const readOnly = roads.filter((road) => road.readOnly).length
  const disabled = readOnly > 0

  const showSide = (tag: QuickTag) =>
    onFieldFocus?.({
      fieldId: 'parking-quick-tags',
      key: focusKeyOf(tag),
      value: undefined,
      side: tag.side,
    })
  const hideSide = () => onFieldFocus?.(null)

  /** One change for all roads, one undo step. A refusal shows a toast and writes nothing. */
  const press = (tag: QuickTag) => {
    if (readOnly > 0) {
      notify.failed(
        `${readOnly} of ${roads.length} selected features are read-only. Nothing was changed.`,
      )
      return
    }
    const on = tag.clearSide !== undefined || clickIsOn(pressedState(tagsOf(roads), tag))
    // the tags as the history has them now, not as they were on the last render
    const graph = editor.history.staging.graph
    const current: RoadTags[] = []
    for (const road of roads) {
      const entity = graph.hasEntity(road.id)
      if (!entity) {
        notify.failed('A selected feature is no longer in the data. Nothing was changed.')
        return
      }
      current.push({ id: road.id, tags: entity.tags })
    }
    const plan = planQuickTag(current, tag, on)
    if (plan.length === 0) return
    editor.history.perform(...plan.map((change) => actionChangeTags(change.id, change.tags)))
    editor.history.commit({
      annotation: annotationOf(tag, on),
      selectedIDs: plan.map((change) => change.id),
    })
  }

  const stateOf = (tag: QuickTag): PressedState => pressedState(tagsOf(roads), tag)
  const pressedAttr = (tag: QuickTag) => {
    const state = stateOf(tag)
    return state === 'mixed' ? 'mixed' : state === 'on'
  }
  const textOf = (tag: QuickTag) => pick(tag.label, tag.labelDe)

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

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label={pick('Parking on the selected road', 'Parken an der gewählten Straße')}
        ref={gridRef}
        className={GRID}
      >
        <span />
        {COLUMNS.map((side) => (
          <span
            key={side}
            className="truncate text-center text-[11px] text-zinc-500 dark:text-zinc-400"
          >
            {side === 'left'
              ? pick('left', 'links')
              : side === 'right'
                ? pick('right', 'rechts')
                : pick('both', 'beide')}
          </span>
        ))}
        {QUICK_TAG_ROWS.flatMap((row, rowIndex) => [
          <span
            key={`${row.id}-label`}
            className="min-w-0 truncate text-xs text-zinc-700 dark:text-zinc-300"
          >
            {pick(row.label, row.labelDe)}
          </span>,
          ...COLUMNS.map((side, colIndex) => {
            const index = rowIndex * COLUMNS.length + colIndex
            const tag = CELLS.get(`${row.id}/${side}`)
            if (!tag) return <span key={`${row.id}-${side}`} />
            const name = textOf(tag)
            const url = iconUrl(tag.icon)
            return (
              <Tooltip key={tag.id} label={name} placement="top">
                <button
                  type="button"
                  data-cell={index}
                  aria-label={name}
                  aria-pressed={pressedAttr(tag)}
                  disabled={disabled}
                  tabIndex={active === index ? 0 : -1}
                  onFocus={() => {
                    setActive(index)
                    showSide(tag)
                  }}
                  onBlur={hideSide}
                  onPointerEnter={() => showSide(tag)}
                  onPointerLeave={hideSide}
                  onKeyDown={(event) => onGridKey(event, index)}
                  onClick={() => press(tag)}
                  className={CELL}
                >
                  {url ? (
                    <img
                      src={url}
                      alt=""
                      width={28}
                      height={28}
                      draggable={false}
                      className="size-7 object-contain"
                    />
                  ) : null}
                </button>
              </Tooltip>
            )
          }),
        ])}
      </div>
      <div className="flex flex-col gap-0.5">
        {COMBINED.map((tag) => {
          const name = textOf(tag)
          const url = iconUrl(tag.icon)
          return (
            <button
              key={tag.id}
              type="button"
              aria-pressed={tag.clearSide ? undefined : pressedAttr(tag)}
              disabled={disabled}
              onFocus={() => showSide(tag)}
              onBlur={hideSide}
              onPointerEnter={() => showSide(tag)}
              onPointerLeave={hideSide}
              onClick={() => press(tag)}
              className={LIST_BUTTON}
            >
              {url ? (
                <img
                  src={url}
                  alt=""
                  width={20}
                  height={20}
                  draggable={false}
                  className="size-5 shrink-0 object-contain"
                />
              ) : null}
              <span className="min-w-0">{name}</span>
            </button>
          )
        })}
      </div>
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

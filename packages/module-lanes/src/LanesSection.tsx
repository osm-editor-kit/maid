/**
 * The inspector section "Lanes": the road's cross-section with the road before and after it (osm-lane-diagram, travel
 * upwards), and a table with a column per lane and a row per value. A change in the table writes one tag (or, to add or
 * remove a lane, the counts and the pipes of that direction) as one undo step. The diagram is not a control: the table
 * is, as in the street space editor (docs/research/lanes-ux.md). Hovering a column marks its lane in the diagram.
 */
import type { Editor } from '@osm-editor-kit/maid-core'
import { actionChangeTags } from '@osm-editor-kit/maid-model'
import type { InspectorSectionProps } from '@osm-editor-kit/maid-ui'
import type { Rule, RuleContext } from '@osm-editor-kit/maid-validation'
import { formatLaneSlotId } from '@osm-editor-kit/osm-lane-diagram'
import type { LaneDirection } from '@osm-editor-kit/osm-lanes'
import { useEffect, useSyncExternalStore, type KeyboardEvent } from 'react'
import { LaneDiagram } from './diagram/LaneDiagram.tsx'
import {
  addLane,
  changedTags,
  laneCounts,
  LANE_PROPS,
  pipeKey,
  removeLane,
  roadIsOneway,
  setLaneValue,
  taggedCounts,
  type LaneProp,
} from './edit.ts'
import { laneFocus } from './hover-store.ts'
import { m } from './messages.ts'
import { laneRules } from './rules/lane-rules.ts'
import { laneScene, osmNumber, type GraphLike } from './scene.ts'

/** The history's staging graph, read as it changes */
function useStagingGraph(editor: Editor) {
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

/** Turn values with an arrow; the list of the OSM wiki's `turn:lanes`, most used first */
const TURNS: Record<string, string> = {
  none: '·',
  through: '↑',
  left: '←',
  right: '→',
  'left;through': '←↑',
  'through;right': '↑→',
  slight_left: '↖',
  slight_right: '↗',
  sharp_left: '↙',
  sharp_right: '↘',
  'left;right': '←→',
  merge_to_left: '⇠',
  merge_to_right: '⇢',
  reverse: '↶',
}
const ACCESS = ['designated', 'yes', 'no']
const CHANGE = ['yes', 'no', 'not_left', 'not_right']

const ROWS: { prop: LaneProp; label: () => string; values?: string[] }[] = [
  { prop: 'turn', label: () => m.row_turn(), values: Object.keys(TURNS) },
  { prop: 'width', label: () => m.row_width() },
  { prop: 'bus', label: () => m.row_bus(), values: ACCESS },
  { prop: 'bicycle', label: () => m.row_bicycle(), values: ACCESS },
  { prop: 'vehicle', label: () => m.row_vehicle(), values: ACCESS },
  { prop: 'change', label: () => m.row_change(), values: CHANGE },
]

const DIRECTION_ARROW: Record<LaneDirection, string> = {
  forward: '↑',
  backward: '↓',
  both_ways: '↕',
}

type Column = { direction: LaneDirection; index: number }

/** The lanes left to right as the diagram shows them (travel upwards): backward lanes, both ways, forward lanes */
function columnsOf(counts: Record<LaneDirection, number>): Column[] {
  const range = (n: number) => Array.from({ length: n }, (_, i) => i)
  return [
    ...range(counts.backward)
      .toReversed()
      .map((index) => ({ direction: 'backward' as const, index })),
    ...range(counts.both_ways).map((index) => ({ direction: 'both_ways' as const, index })),
    ...range(counts.forward).map((index) => ({ direction: 'forward' as const, index })),
  ]
}

const CELL =
  'h-7 w-full min-w-20 rounded border border-zinc-950/10 bg-white px-1 text-xs text-zinc-950 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:[color-scheme:dark]'
const SMALL_BUTTON =
  'inline-flex h-6 min-w-6 items-center justify-center rounded border border-zinc-950/10 bg-white px-1.5 text-xs text-zinc-700 hover:border-zinc-950/30 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-white/30'

export function LanesSection({ entity, editor, readOnly }: InspectorSectionProps) {
  const graph = useStagingGraph(editor) as unknown as GraphLike
  const hovered = useSyncExternalStore(laneFocus.subscribe, laneFocus.hovered)
  const chosen = useSyncExternalStore(laneFocus.subscribe, laneFocus.chosen)
  const setHovered = laneFocus.setHovered
  // a lane chosen on one road is not chosen on the next one
  useEffect(
    () => () => {
      laneFocus.setChosen(null)
      laneFocus.setHovered(null)
    },
    [entity.id],
  )
  const way = graph.hasEntity(entity.id)
  if (!way) return null
  const locked = entity.readOnly || (readOnly?.(entity.id) ?? false)
  const tags = way.tags
  const oneway = roadIsOneway(tags)
  const counts = laneCounts(tags)
  const tagged = taggedCounts(tags)
  const columns = columnsOf(counts)
  // the lane rules of the Issues dock, on this road: the same texts, in the page's language
  const warnings = laneRules.flatMap((rule) =>
    rule.validate(way as unknown as Parameters<Rule['validate']>[0], {} as RuleContext),
  )
  const { scene, before, after } = laneScene(graph, way)
  const wayNumber = osmNumber(way.id)

  const write = (next: Record<string, string | undefined>, annotation: string) => {
    if (locked) return
    editor.history.perform(actionChangeTags(entity.id, changedTags(next)))
    editor.history.commit({ annotation, selectedIDs: [entity.id] })
  }
  const setValue = (column: Column, prop: LaneProp, value: string) => {
    const current = valueOf(column, prop)
    if ((current ?? '') === value.trim()) return
    write(setLaneValue(tags, column.direction, column.index, prop, value), m.undo_value())
  }
  const valueOf = (column: Column, prop: LaneProp) =>
    tags[pipeKey(LANE_PROPS[prop], column.direction, oneway)]?.split('|')[column.index] || undefined

  const directions: LaneDirection[] = oneway
    ? ['forward']
    : counts.both_ways > 0
      ? ['backward', 'both_ways', 'forward']
      : ['backward', 'forward']

  return (
    <div className="flex flex-col gap-3" data-lanes-section="">
      <figure className="flex flex-col gap-1">
        <div className="max-h-80 overflow-auto rounded-md border border-zinc-950/10 bg-zinc-50 p-1 dark:border-white/10 dark:bg-zinc-900">
          <LaneDiagram
            scene={scene}
            currentWayId={wayNumber}
            hoveredSlotId={hovered}
            chosenSlotId={chosen}
            onHover={setHovered}
            onChoose={laneFocus.setChosen}
            labels={{ alt: m.diagram_alt(), slot: (id) => slotLabel(id, oneway) }}
          />
        </div>
        <figcaption className="text-xs text-zinc-500 dark:text-zinc-400">
          {m.diagram_help()}{' '}
          {before === undefined && after === undefined ? m.neighbours_none() : null}
        </figcaption>
      </figure>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-zinc-700 dark:text-zinc-300">
        {directions.map((direction) => (
          <div key={direction} className="flex items-center gap-1.5" data-lanes-count={direction}>
            <span aria-hidden="true">{DIRECTION_ARROW[direction]}</span>
            <span>{directionLabel(direction, oneway)}</span>
            <span className="font-medium tabular-nums">{tagged[direction]}</span>
            <button
              type="button"
              className={SMALL_BUTTON}
              disabled={locked}
              aria-label={m.add_lane_to({ direction: directionLabel(direction, oneway) })}
              title={m.add_lane_to({ direction: directionLabel(direction, oneway) })}
              onClick={() => write(addLane(tags, direction), m.undo_add())}
            >
              +
            </button>
          </div>
        ))}
      </div>

      {columns.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.no_lanes()}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1 text-xs" data-lanes-table="">
            <thead>
              <tr>
                <th scope="col" className="sr-only">
                  {m.row_lane()}
                </th>
                {columns.map((column) => {
                  const slotId = formatLaneSlotId(wayNumber, column.direction, column.index)
                  return (
                    <th
                      key={slotId}
                      scope="col"
                      className={`rounded px-1 py-0.5 text-center font-normal text-zinc-600 dark:text-zinc-300 ${chosen === slotId ? 'bg-blue-100 ring-2 ring-blue-600 dark:bg-blue-900/40' : hovered === slotId ? 'bg-amber-100 dark:bg-amber-900/40' : ''}`}
                      data-lane-column={slotId}
                      data-chosen={chosen === slotId ? '' : undefined}
                      onPointerEnter={() => setHovered(slotId)}
                      onPointerLeave={() => setHovered(null)}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest('button')) return
                        laneFocus.setChosen(chosen === slotId ? null : slotId)
                      }}
                    >
                      <span className="flex items-center justify-center gap-1">
                        <span title={directionLabel(column.direction, oneway)}>
                          {DIRECTION_ARROW[column.direction]} {column.index + 1}
                        </span>
                        <button
                          type="button"
                          className={SMALL_BUTTON}
                          disabled={
                            locked ||
                            (column.direction !== 'both_ways' && counts[column.direction] <= 1)
                          }
                          aria-label={m.remove_lane()}
                          title={m.remove_lane()}
                          data-lane-remove={`${column.direction}:${column.index}`}
                          onClick={() =>
                            write(removeLane(tags, column.direction, column.index), m.undo_remove())
                          }
                        >
                          ×
                        </button>
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.prop}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-white pr-1 text-left font-normal whitespace-nowrap text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"
                  >
                    {row.label()}
                  </th>
                  {columns.map((column) => {
                    const slotId = formatLaneSlotId(wayNumber, column.direction, column.index)
                    const value = valueOf(column, row.prop)
                    const label = `${row.label()}, ${DIRECTION_ARROW[column.direction]} ${column.index + 1}`
                    return (
                      <td
                        key={slotId}
                        onPointerEnter={() => setHovered(slotId)}
                        onPointerLeave={() => setHovered(null)}
                      >
                        {row.values ? (
                          <select
                            className={CELL}
                            aria-label={label}
                            disabled={locked}
                            value={value ?? ''}
                            data-lane-cell={`${row.prop}:${column.direction}:${column.index}`}
                            onFocus={() => setHovered(slotId)}
                            onChange={(event) => setValue(column, row.prop, event.target.value)}
                          >
                            <option value="">–</option>
                            {[
                              ...row.values,
                              ...(value && !row.values.includes(value) ? [value] : []),
                            ].map((option) => (
                              <option key={option} value={option}>
                                {row.prop === 'turn' && TURNS[option]
                                  ? `${TURNS[option]} ${option}`
                                  : option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            key={value ?? ''}
                            className={CELL}
                            aria-label={label}
                            disabled={locked}
                            inputMode="decimal"
                            defaultValue={value ?? ''}
                            data-lane-cell={`${row.prop}:${column.direction}:${column.index}`}
                            onFocus={() => setHovered(slotId)}
                            onBlur={(event) => setValue(column, row.prop, event.target.value)}
                            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                              if (event.key === 'Enter') event.currentTarget.blur()
                            }}
                          />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {locked && <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.read_only()}</p>}

      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs" data-lanes-warnings="">
          {warnings.map((warning) => (
            <li
              key={warning.id}
              className={
                warning.severity === 'error'
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-amber-700 dark:text-amber-400'
              }
            >
              {warning.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function directionLabel(direction: LaneDirection, oneway: boolean): string {
  if (oneway) return m.direction_oneway()
  if (direction === 'forward') return m.direction_forward()
  if (direction === 'backward') return m.direction_backward()
  return m.direction_both_ways()
}

/** The name of a lane of the diagram for screen readers: "↑ 2, In the way's direction", or what it is */
function slotLabel(slotId: string, oneway: boolean): string {
  const lane = /\/lane\/(forward|backward|both_ways)\/(\d+)$/.exec(slotId)
  if (!lane) return m.diagram_side()
  const direction = lane[1] as LaneDirection
  const index = Number(lane[2])
  if (index >= 10_000) return m.diagram_cycle_lane({ direction: directionLabel(direction, oneway) })
  return `${DIRECTION_ARROW[direction]} ${index + 1}, ${directionLabel(direction, oneway)}`
}

import { Bars3Icon, ChevronRightIcon } from '@heroicons/react/16/solid'
import { getLocale, m } from '@osm-editor-kit/maid-i18n'
import { actionMoveMember, OsmRelation } from '@osm-editor-kit/maid-model'
import type { PreviewRelation, RouteInput } from '@osm-editor-kit/maid-route-analysis'
import { notify, UI_SPRING } from '@osm-editor-kit/maid-ui'
import { Reorder, useDragControls, useReducedMotion } from 'motion/react'
import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useShell } from '../../shell-context'
import { useRelatedWhileHovered } from '../relations-hover.ts'
import { colourOf, groupDropMove, memberRows, relationLabel } from '../relations-logic.ts'
import { openRelationActions } from '../relations-open-store.ts'
import { dataVersion } from './data-version.ts'
import { formatKm } from './overview-logic.ts'
import { routeInputOf } from './route-input.ts'
import {
  NEUTRAL,
  OverviewHead,
  prepared,
  PreviewBar,
  RouteDiagram,
  STATE_ICON,
  useOverviewSelect,
  usePreview,
  type Prepared,
  type Select,
} from './route-overview.tsx'

/** More stages than this start folded: their heads alone already make a long list */
const OPEN_UP_TO = 5

/** A stage of the superroute: its member index, its relation if loaded, its preview if there is one */
type Stage = {
  index: number
  id: string
  name: string
  relation: OsmRelation | undefined
  route: Prepared | undefined
}

// Open or folded, for the whole session, as the route overview
let overviewOpen = true

/**
 * A superroute (or a `route_master`) as a group of routes: its head, then one group per sub-relation in member order,
 * each with its head (name, state, km) and the line of that stage. A stage that is not loaded comes from the preview
 * of the superroute, which brings two levels of sub-relations in one request. A stage's head opens the stage in the
 * column; the head of the overview is the superroute itself.
 *
 * The handle on a stage's head starts the order view: every stage folds to its head, and the heads are moved (drag,
 * or the up and down buttons), each move one undo step, as the member list does it (relations-reorder.tsx).
 */
export function SuperrouteOverview({
  relation,
  select,
}: {
  relation: OsmRelation
  select: Select
}) {
  'use no memo'
  // not compiled: it reads the graph and the engine, objects that stay the same when data arrives
  const { engine, editor } = useShell()
  const graph = editor.history.staging.graph
  const version = dataVersion(editor.history)
  const preview = usePreview(relation.id)
  const { selectId, loadAndSelect } = useOverviewSelect(select)
  const [expanded, setExpanded] = useState(overviewOpen)
  const [mode, setMode] = useState<'schematic' | 'scaled'>('schematic')
  const [reordering, setReordering] = useState(false)
  const rows = memberRows(graph, relation)
  const stageRows = rows.filter((row) => row.type === 'relation')
  const [opened, setOpened] = useState<ReadonlySet<string>>(
    () => new Set(stageRows.length <= OPEN_UP_TO ? stageRows.map((row) => row.id) : []),
  )
  // the order of a drag in progress, by member index
  const [dragOrder, setDragOrder] = useState<number[] | null>(null)
  const readOnly = engine.isReadOnly(relation.id)

  const stages: Stage[] = stageRows.map((row) => {
    const child = graph.hasEntity(row.id)
    const loaded = child instanceof OsmRelation ? child : undefined
    const previewed: PreviewRelation | undefined = preview.entry?.preview.relations.get(row.id)
    const key: object | undefined = loaded ?? previewed
    const input = (): RouteInput =>
      loaded
        ? routeInputOf(graph, loaded)
        : { tags: previewed!.tags, members: previewed!.members, ways: new Map(), nodes: new Map() }
    const tags = loaded?.tags ?? previewed?.tags
    return {
      index: row.index,
      id: row.id,
      name: loaded
        ? relationLabel(loaded)
        : (tags?.name ?? tags?.ref ?? m.route_overview_label_relation({ id: row.id })),
      relation: loaded,
      route: key ? prepared(key, version, preview.entry, input) : undefined,
    }
  })
  const missing = stages.reduce((sum, stage) => sum + (stage.route ? stage.route.missing : 1), 0)
  const showPreviewBar = preview.previews.enabled && (missing > 0 || preview.entry !== undefined)
  const order = dragOrder ?? stages.map((stage) => stage.index)
  const byIndex = new Map(stages.map((stage) => [stage.index, stage]))

  function openStage(stage: Stage) {
    const go = () => {
      openRelationActions.open(stage.id, relation.id)
      selectId(stage.id)
    }
    if (stage.relation) go()
    else engine.loadEntity(stage.id).then(go, (error: unknown) => notify.failed(error))
  }
  function commit(from: number, to: number) {
    editor.history.perform(actionMoveMember(relation.id, from, to))
    editor.history.commit({
      annotation: m.relations_undo_move({ relation: relationLabel(relation) }),
      selectedIDs: [...engine.selection],
    })
  }
  function drop(index: number) {
    const after = (dragOrder ?? []).map((i) => ({ index: i }))
    setDragOrder(null)
    const move = groupDropMove(rows, stageRows, after, index)
    if (move) commit(move.from, move.to)
  }
  function step(index: number, direction: -1 | 1) {
    const at = order.indexOf(index)
    const target = order[at + direction]
    if (target === undefined) return
    const next = [...order]
    next.splice(at, 1)
    next.splice(at + direction, 0, index)
    const move = groupDropMove(
      rows,
      stageRows,
      next.map((i) => ({ index: i })),
      index,
    )
    if (move) commit(move.from, move.to)
  }

  return (
    <section aria-label={m.route_overview_title()} className="px-3 py-2">
      <OverviewHead
        title={(relation.tags.type?.trim() === 'route_master'
          ? m.route_overview_variants
          : m.route_overview_stages)({ count: stages.length })}
        expanded={expanded}
        onToggle={() => {
          overviewOpen = !expanded
          setExpanded(!expanded)
        }}
        analysis={undefined}
        mode={mode}
        setMode={setMode}
      />
      {expanded ? (
        <>
          {showPreviewBar ? (
            <PreviewBar state={preview.state} missing={missing} onLoad={preview.load} />
          ) : null}
          {reordering ? (
            <div className="mb-1 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="flex-1">{m.route_overview_reorder_hint()}</span>
              <button
                type="button"
                onClick={() => setReordering(false)}
                className="cursor-pointer rounded-md bg-zinc-950/5 px-2 py-1 font-medium text-zinc-700 hover:bg-zinc-950/10 focus-visible:outline-2 focus-visible:outline-blue-500 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15"
              >
                {m.route_overview_reorder_done()}
              </button>
            </div>
          ) : null}
          <Reorder.Group
            as="ul"
            axis="y"
            values={order}
            onReorder={(next: number[]) => setDragOrder(next)}
            className="flex flex-col gap-1"
          >
            {order.map((index) => {
              const stage = byIndex.get(index)
              if (!stage) return null
              const open = !reordering && opened.has(stage.id)
              return (
                <StageGroup
                  key={stage.index}
                  stage={stage}
                  open={open}
                  reordering={reordering}
                  canMove={!readOnly}
                  onToggle={() => {
                    const next = new Set(opened)
                    if (next.has(stage.id)) next.delete(stage.id)
                    else next.add(stage.id)
                    setOpened(next)
                  }}
                  onOpen={() => openStage(stage)}
                  onStartReorder={() => setReordering(true)}
                  onDrop={() => drop(stage.index)}
                  onStep={(direction) => step(stage.index, direction)}
                >
                  {open && stage.route ? (
                    <div className="mt-1 ml-2 border-l border-zinc-950/10 pl-1 dark:border-white/10">
                      <RouteDiagram
                        route={stage.route}
                        mode={mode}
                        relationId={stage.id}
                        colour={stage.relation ? (colourOf(stage.relation) ?? NEUTRAL) : NEUTRAL}
                        scroll={false}
                        selectId={selectId}
                        loadAndSelect={loadAndSelect}
                      />
                    </div>
                  ) : null}
                </StageGroup>
              )
            })}
          </Reorder.Group>
        </>
      ) : null}
    </section>
  )
}

/** One stage: its head (fold, name, state, km, open, handle) and, while open, its line */
function StageGroup({
  stage,
  open,
  reordering,
  canMove,
  onToggle,
  onOpen,
  onStartReorder,
  onDrop,
  onStep,
  children,
}: {
  stage: Stage
  open: boolean
  reordering: boolean
  canMove: boolean
  onToggle: () => void
  onOpen: () => void
  onStartReorder: () => void
  onDrop: () => void
  onStep: (direction: -1 | 1) => void
  children: ReactNode
}) {
  const controls = useDragControls()
  const reduced = useReducedMotion() === true
  const hover = useRelatedWhileHovered(() => [stage.id], stage.id)
  const analysis = stage.route?.analysis
  function startDrag(event: ReactPointerEvent) {
    // the first press on a handle folds every stage to its head, and the same press drags this one
    if (!reordering) onStartReorder()
    controls.start(event.nativeEvent)
  }
  return (
    <Reorder.Item
      as="li"
      value={stage.index}
      data-stage={stage.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      transition={reduced ? { duration: 0 } : UI_SPRING}
      className="rounded-lg bg-white dark:bg-zinc-900"
    >
      <div
        {...hover}
        className="group flex min-h-8 items-center gap-1 rounded-lg px-1 hover:bg-amber-100/60 dark:hover:bg-amber-500/10"
      >
        {reordering ? null : (
          <button
            type="button"
            aria-expanded={open}
            aria-label={(open ? m.route_overview_stage_hide : m.route_overview_stage_show)({
              name: stage.name,
            })}
            disabled={!stage.route}
            onClick={onToggle}
            className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-40 dark:hover:bg-white/10"
          >
            <ChevronRightIcon
              aria-hidden="true"
              className={`size-4 text-zinc-400 ${open ? 'rotate-90' : ''}`}
            />
          </button>
        )}
        <button
          type="button"
          aria-label={m.route_overview_stage_open({ name: stage.name })}
          onClick={onOpen}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded py-1 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <span className="min-w-0 truncate">{stage.name}</span>
          {analysis ? (
            <span aria-hidden="true" className="shrink-0">
              {STATE_ICON[analysis.chain.linear]}
            </span>
          ) : null}
          <span className="shrink-0 text-[11px] font-normal text-zinc-500 tabular-nums dark:text-zinc-400">
            {analysis
              ? m.route_overview_km({ km: formatKm(analysis.chain.length, getLocale()) })
              : m.route_overview_stage_not_loaded()}
          </span>
        </button>
        {canMove && reordering ? (
          <>
            <button
              type="button"
              aria-label={m.route_overview_reorder_up({ name: stage.name })}
              onClick={() => onStep(-1)}
              className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-xs text-zinc-500 hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/10"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={m.route_overview_reorder_down({ name: stage.name })}
              onClick={() => onStep(1)}
              className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-xs text-zinc-500 hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/10"
            >
              ↓
            </button>
          </>
        ) : null}
        {canMove ? (
          <button
            type="button"
            aria-label={m.route_overview_stage_move({ name: stage.name })}
            title={m.route_overview_stage_move({ name: stage.name })}
            onPointerDown={startDrag}
            onClick={() => {
              if (!reordering) onStartReorder()
            }}
            className="grid h-6 w-5 shrink-0 cursor-grab touch-none place-items-center rounded text-zinc-400 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:text-white"
          >
            <Bars3Icon aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
      {children}
    </Reorder.Item>
  )
}

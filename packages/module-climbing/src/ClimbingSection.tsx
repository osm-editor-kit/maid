import type { Editor } from '@osm-editor-kit/maid-core'
import type { Graph } from '@osm-editor-kit/maid-model'
import { OsmRelation } from '@osm-editor-kit/maid-model'
import type { InspectorSectionProps } from '@osm-editor-kit/maid-ui'
import { useSyncExternalStore } from 'react'
import { difficultyBand, type Grade } from './grades.ts'
import {
  addToRelationAction,
  areaCrags,
  cragRoutes,
  isRoute,
  kindOf,
  nearbyCrags,
  newCragActions,
  parentsOf,
} from './logic.ts'
import { m } from './messages.ts'

/** The history's staging graph, read as it changes (as module-lanes reads it) */
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

const BUTTON =
  'rounded-md bg-white px-2 py-0.5 text-xs font-medium text-zinc-800 shadow-xs ring-1 ring-zinc-950/10 hover:bg-zinc-50 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10 dark:hover:bg-zinc-700'
const ROW =
  'flex w-full min-w-0 items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-zinc-950/5 dark:hover:bg-white/5'
const MUTED = 'text-xs text-zinc-500 dark:text-zinc-400'

/** Grade colours by difficulty band, easy to hard: the usual green, blue, yellow, red, black of climbing gyms */
const BAND_CLASSES = [
  'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200',
  'bg-green-600 text-white',
  'bg-blue-600 text-white',
  'bg-yellow-400 text-zinc-900',
  'bg-red-600 text-white',
  'bg-zinc-900 text-white dark:bg-black',
]

function GradeChip({ grade, band }: { grade: Grade | undefined; band: number | undefined }) {
  if (!grade) return <span className={`${MUTED} w-12 shrink-0`}>{m.climbing_no_grade()}</span>
  return (
    <span
      className={`w-12 shrink-0 rounded px-1 text-center text-xs font-semibold tabular-nums ${BAND_CLASSES[band ?? 0]}`}
      title={grade.system ? `${grade.value} (${grade.system})` : grade.value}
    >
      {grade.value}
    </span>
  )
}

function commit(
  editor: Editor,
  annotation: string,
  selected: string,
  ...actions: Parameters<Editor['history']['perform']>
) {
  editor.history.perform(...actions)
  editor.history.commit({ annotation, selectedIDs: [selected] })
}

/**
 * The section at the top of a climbing feature's inspector:
 * - a crag: its routes in the order of the rock, with grade, length and bolts; a click selects one;
 * - an area: its crags with their number of routes;
 * - a route: the crag it is in, or the crags near it to add it to, or a new crag with it.
 * Reordering and roles are the relation column's ("Open" in the Members section).
 */
export function ClimbingSection({
  entity,
  editor,
  select,
  onHover,
  readOnly,
}: InspectorSectionProps) {
  const graph = useStagingGraph(editor)
  const kind = kindOf(entity.tags)
  const locked = entity.readOnly
  const relation = graph.hasEntity(entity.id)

  if (kind === 'crag' && relation instanceof OsmRelation) {
    const rows = cragRoutes(graph, relation)
    return (
      <div className="grid gap-1">
        <p className={MUTED}>{m.climbing_crag_routes({ count: rows.length })}</p>
        <ol className="grid">
          {rows.map((row) => {
            const tags = graph.hasEntity(row.id)?.tags ?? {}
            const facts = [
              row.length ? m.climbing_metres({ value: row.length }) : undefined,
              row.bolts ? m.climbing_bolts({ count: row.bolts }) : undefined,
            ].filter(Boolean)
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className={ROW}
                  disabled={!row.loaded}
                  onClick={() => select(row.id)}
                  onPointerEnter={() => onHover?.(row.id)}
                  onPointerLeave={() => onHover?.(null)}
                >
                  <span className="w-5 shrink-0 text-right text-xs text-zinc-500 tabular-nums">
                    {row.number}
                  </span>
                  <GradeChip grade={row.grade} band={difficultyBand(tags)} />
                  <span className="min-w-0 flex-1 truncate">
                    {row.loaded ? (row.name ?? m.climbing_unnamed()) : m.climbing_not_loaded()}
                  </span>
                  <span className={`${MUTED} shrink-0 tabular-nums`}>{facts.join(' · ')}</span>
                </button>
              </li>
            )
          })}
        </ol>
        <p className={MUTED}>{m.climbing_order_hint()}</p>
      </div>
    )
  }

  if (kind === 'crag') {
    return <p className={MUTED}>{m.climbing_crag_point_hint()}</p>
  }

  if (kind === 'area' && relation instanceof OsmRelation) {
    const rows = areaCrags(graph, relation)
    return (
      <div className="grid gap-1">
        <p className={MUTED}>{m.climbing_area_crags({ count: rows.length })}</p>
        <ul className="grid">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className={ROW}
                onClick={() => select(row.id)}
                onPointerEnter={() => onHover?.(row.id)}
                onPointerLeave={() => onHover?.(null)}
              >
                <span className="min-w-0 flex-1 truncate">{row.name ?? m.climbing_unnamed()}</span>
                <span className={`${MUTED} shrink-0`}>
                  {m.climbing_crag_routes({ count: row.routes })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (!isRoute(kind)) return null
  const crags = parentsOf(graph, entity.id, 'crag')
  if (crags.length > 0) {
    return (
      <div className="grid gap-1">
        {crags.map((crag) => {
          const routes = cragRoutes(graph, crag)
          const number = routes.find((row) => row.id === entity.id)?.number
          return (
            <div key={crag.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {m.climbing_route_in_crag({
                  crag: crag.tags.name ?? m.climbing_unnamed(),
                  number: number ?? '?',
                  count: routes.length,
                })}
              </span>
              <button type="button" className={BUTTON} onClick={() => select(crag.id)}>
                {m.climbing_select_crag()}
              </button>
            </div>
          )
        })}
      </div>
    )
  }

  const nearby = nearbyCrags(graph, entity.id)
  const blocked = locked || nearby.some((item) => readOnly?.(item.relation.id))
  return (
    <div className="grid gap-1.5">
      <p className="text-sm">{m.climbing_route_no_crag()}</p>
      {nearby.length > 0 ? (
        <ul className="grid gap-1">
          {nearby.map(({ relation: crag, metres }) => (
            <li key={crag.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {crag.tags.name ?? m.climbing_unnamed()}
              </span>
              <span className={`${MUTED} tabular-nums`}>
                {m.climbing_metres({ value: String(Math.round(metres)) })}
              </span>
              <button
                type="button"
                className={BUTTON}
                disabled={blocked || readOnly?.(crag.id)}
                onClick={() =>
                  commit(
                    editor,
                    m.climbing_added_to_crag({ crag: crag.tags.name ?? m.climbing_unnamed() }),
                    entity.id,
                    addToRelationAction(crag.id, entity.id),
                  )
                }
              >
                {m.climbing_add_to_crag()}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={MUTED}>{m.climbing_no_crag_near()}</p>
      )}
      <div>
        <button
          type="button"
          className={BUTTON}
          disabled={locked}
          onClick={() => {
            const { crag, actions } = newCragActions(graph, entity.id)
            editor.history.perform(...actions)
            // the new crag is selected, so that it gets its name next
            editor.history.commit({
              annotation: m.climbing_new_crag_done(),
              selectedIDs: [crag.id],
            })
            select(crag.id)
          }}
        >
          {m.climbing_new_crag()}
        </button>
      </div>
    </div>
  )
}

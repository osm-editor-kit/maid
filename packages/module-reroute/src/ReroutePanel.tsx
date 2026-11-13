import type { Editor } from '@osm-editor-kit/maid-core'
// The bar of the route planner mode over the map (RerouteOnMap puts it there). The plan and the port give codes; the
// words are the module's texts, chosen here.
import { device } from '@osm-editor-kit/maid-i18n'
import { OsmRelation, type Graph } from '@osm-editor-kit/maid-model'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import type { RerouteRefusal } from './apply-port.ts'
import { m } from './messages.ts'
import { routeLabel } from './operation.ts'
import { rerouteActions, useRerouteFailure, useRerouteLastChange } from './reroute-store.ts'
import type { RoutePreview } from './route.ts'

const BUTTON =
  'shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800'
const PRIMARY =
  'shrink-0 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50'
const HINT = 'text-xs leading-snug text-zinc-600 dark:text-zinc-400'

/** The words for a reason the router gave */
function routeReasonText(reason: string): string {
  switch (reason) {
    case 'start-not-routable':
      return m.reroute_start_not_routable()
    case 'end-not-routable':
      return m.reroute_end_not_routable()
    case 'no-path':
      return m.reroute_no_path()
    case 'limit':
      return m.reroute_limit()
    default:
      return m.reroute_refusal_internal()
  }
}

/** The words for a refusal of the plan, or of the apply */
function refusalText(reason: RerouteRefusal): string {
  switch (reason) {
    case 'no-route':
      return m.reroute_refusal_no_route()
    case 'same-place':
      return m.reroute_refusal_same_place()
    case 'relation-missing':
    case 'not-a-route':
    case 'unsupported-route':
      return m.reroute_refusal_relation()
    case 'bad-stretch':
      return m.reroute_refusal_bad_stretch()
    case 'relation-changed':
      return m.reroute_refusal_relation_changed()
    case 'read-only':
      return m.reroute_refusal_read_only()
    case 'way-not-loaded':
      return m.reroute_refusal_way_not_loaded()
    case 'closed-way-split':
      return m.reroute_refusal_closed_way_split()
    case 'split-way-used-outside':
      return m.reroute_refusal_split_way_used_outside()
    case 'split-not-resolved':
      return m.reroute_refusal_split_not_resolved()
    case 'route-changed':
      return m.reroute_refusal_route_changed()
    case 'internal':
      return m.reroute_refusal_internal()
  }
}

/** What the panel says now: the next step, or the problem with the route between the points */
function stepText(preview: RoutePreview): string {
  if (!preview.start) return m.reroute_step_start({ ...device() })
  if (!preview.end) return m.reroute_step_end({ ...device() })
  if (preview.route && !preview.route.ok) return routeReasonText(preview.route.reason)
  if (!preview.stretch) return m.reroute_no_member({ ...device() })
  if (preview.plan && !preview.plan.ok) return refusalText(preview.plan.reason)
  return m.reroute_step_done({ ...device() })
}

export type ReroutePanelProps = {
  editor: Editor
  engine?: MaidEngine
  graph: Graph
  preview: RoutePreview
  readOnly?: (id: EntityID) => boolean
}

/**
 * The bar of the route planner mode, small in the map's corner: the route, how to drag it, why a drag cannot be made,
 * Undo and Done. What the drops changed is in the route's list of ways on the left (member-marks.ts), not here
 * (Tobias, 2026-11-13). The drop writes the edit itself (RerouteOnMap).
 */
export function ReroutePanel({ engine, graph, preview }: ReroutePanelProps) {
  const lastChange = useRerouteLastChange()
  const failure = useRerouteFailure()
  const relation = graph.hasEntity(preview.relationId)
  const name = relation instanceof OsmRelation ? routeLabel(relation) : preview.relationId
  const editing = preview.start !== undefined
  const problem = editing && !preview.plan?.ok ? stepText(preview) : undefined

  return (
    <section
      aria-label={m.reroute_panel_title({ name })}
      data-reroute-panel
      className="flex flex-col gap-1.5 rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-zinc-900 shadow-md dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100"
    >
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" title={name}>
          {m.reroute_panel_title({ name })}
        </h2>
        {!editing && lastChange && (
          <button
            type="button"
            className={BUTTON}
            onClick={() => {
              engine?.undo()
              rerouteActions.forgetChange()
            }}
          >
            {m.reroute_undo()}
          </button>
        )}
        {editing && (
          <button type="button" className={BUTTON} onClick={() => rerouteActions.discard()}>
            {m.reroute_cancel()}
          </button>
        )}
        <button type="button" className={PRIMARY} onClick={() => rerouteActions.stop()}>
          {m.reroute_finish()}
        </button>
      </div>
      <p className={HINT}>{m.reroute_panel_hint({ ...device() })}</p>
      {problem && (
        <p className="text-xs text-amber-700 dark:text-amber-400" data-reroute-step>
          {problem}
        </p>
      )}
      {failure && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {refusalText(failure as RerouteRefusal)}
        </p>
      )}
    </section>
  )
}

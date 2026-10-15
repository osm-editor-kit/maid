/**
 * The writer of a reroute: turns the route the person accepted into edits on the editor's history, as one undo step.
 * The planning is pure and lives in plan.ts (`planReroute`); this file only checks the data as it is at the moment of
 * Apply (the ways of the route must be the ones the preview routed on, since a plan mints new ids and trusts the graph
 * it was made on), plans again, then performs and commits.
 */
import type { Editor } from '@osm-editor-kit/maid-core'
import type { RouteResult } from '@osm-editor-kit/maid-routing'
import { changedRouteWay, planReroute, type PlanRefusal, type RouteWay } from './plan.ts'

/** The accepted route: where it goes in the relation, the route the router found, and the answers to the role questions */
export type RerouteRequest = {
  relationId: EntityID
  /** The members that are replaced: first and last index in the relation's member list, inclusive, from <= to. `reversed`:
   * the route runs against the member order */
  stretch: { from: number; to: number; reversed: boolean }
  /** The ids of those members as the preview showed them: a change since then refuses the apply */
  expectedIds: EntityID[]
  /** The route the router found, as the preview had it */
  route: RouteResult
  /** The mapper's answer to each role question, by route segment index. A question not answered takes its suggestion. */
  roleChoices: Readonly<Record<number, string>>
  /** The ways the route runs on, with their nodes and tags as the preview saw them: a change to one refuses the apply */
  routeWays: RouteWay[]
}

/** Why the apply refused: a plan's refusal, or the route's ways changed since the preview */
export type RerouteRefusal = PlanRefusal | 'route-changed'

export type RerouteApplyResult = { ok: true } | { ok: false; reason: RerouteRefusal }

export interface RerouteApply {
  /**
   * Writes the reroute on the editor's history as one undo step. Nothing is written when the result is not ok.
   * `readOnly` is the filters' answer for an entity (see planReroute); absent, nothing is read-only.
   */
  apply(
    editor: Editor,
    request: RerouteRequest,
    readOnly?: (id: EntityID) => boolean,
  ): RerouteApplyResult
}

/** The default writer: checks the route's ways on the current data, plans, and performs the plan's actions as one step */
export const planApply: RerouteApply = {
  apply(editor, request, readOnly) {
    const graph = editor.history.staging.graph
    if (changedRouteWay(graph, request.routeWays) !== undefined) {
      return { ok: false, reason: 'route-changed' }
    }
    const plan = planReroute({
      graph,
      relationId: request.relationId,
      stretch: request.stretch,
      expectedIds: request.expectedIds,
      route: request.route,
      roleChoices: { ...request.roleChoices },
      readOnly,
    })
    if (!plan.ok) return { ok: false, reason: plan.reason }
    editor.history.perform(...plan.actions)
    editor.history.commit({
      annotation: 'Rerouted a stretch of a route',
      selectedIDs: [request.relationId],
    })
    return { ok: true }
  },
}

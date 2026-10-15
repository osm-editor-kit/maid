/**
 * The writer of a reroute: turns the route the person accepted into edits on the editor's history, as one undo step.
 * The planning is pure and lives in plan.ts (`planReroute`); this file only plans again on the data as it is at the
 * moment of Apply (a plan mints new ids and trusts the graph it was made on), then performs and commits.
 */
import type { Editor } from '@osm-editor-kit/maid-core'
import type { RouteResult } from '@osm-editor-kit/maid-routing'
import { planReroute } from './plan.ts'

/** The accepted route: where it goes in the relation, the route the router found, and the answers to the role questions */
export type RerouteRequest = {
  relationId: EntityID
  /** The members that are replaced: first and last index in the relation's member list, inclusive, from <= to */
  stretch: { from: number; to: number }
  /** The ids of those members as the preview showed them: a change since then refuses the apply */
  expectedIds: EntityID[]
  /** The route the router found, as the preview had it */
  route: RouteResult
  /** The mapper's answer to each role question, by route segment index. A question not answered takes its suggestion. */
  roleChoices: Readonly<Record<number, string>>
}

export type RerouteApplyResult = { ok: true } | { ok: false; reason: string }

export interface RerouteApply {
  /** Writes the reroute on the editor's history as one undo step. Nothing is written when the result is not ok. */
  apply(editor: Editor, request: RerouteRequest): RerouteApplyResult
}

/** The default writer: plans on the current data, and performs the plan's actions and commits them as one step */
export const planApply: RerouteApply = {
  apply(editor, request) {
    const plan = planReroute({
      graph: editor.history.staging.graph,
      relationId: request.relationId,
      stretch: request.stretch,
      expectedIds: request.expectedIds,
      route: request.route,
      roleChoices: { ...request.roleChoices },
    })
    if (!plan.ok) return { ok: false, reason: plan.detail }
    editor.history.perform(...plan.actions)
    editor.history.commit({
      annotation: 'Rerouted a stretch of a route',
      selectedIDs: [request.relationId],
    })
    return { ok: true }
  },
}

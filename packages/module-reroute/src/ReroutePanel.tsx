import type { Editor } from '@osm-editor-kit/maid-core'
// The panel of a reroute under way, over the map (RerouteOnMap puts it there): the route's name, the next step, what
// leaves the route and what joins it (the colours of the map's edits display, as the way table's "Highlight changes"),
// the numbers of the plan, the direction questions, the occurrence choice, and Apply and Cancel. Apply goes through
// the port, which plans again on the data as it is then. The plan and the port give codes; the words are the module's
// texts, chosen here.
import { device } from '@osm-editor-kit/maid-i18n'
import { OsmRelation, OsmWay, type Graph } from '@osm-editor-kit/maid-model'
import { useState } from 'react'
import type { RerouteApply, RerouteRefusal } from './apply-port.ts'
import { m } from './messages.ts'
import { routeLabel } from './operation.ts'
import type { ReroutePlan, RoleQuestion, RoleReason } from './plan.ts'
import { changedWays } from './preview-shapes.ts'
import { rerouteActions, useRerouteRoleChoices, useRerouteVias } from './reroute-store.ts'
import { requestOf, type RoutePreview } from './route.ts'

const BUTTON =
  'rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800'
const PRIMARY =
  'rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
const HINT = 'text-sm text-zinc-600 dark:text-zinc-400'

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

/** The words for why a role is a question */
function roleReasonText(reason: RoleReason): string {
  switch (reason) {
    case 'two-way-sidewalk':
      return m.reroute_reason_sidewalk()
    case 'two-way-sidepath':
      return m.reroute_reason_sidepath()
    case 'two-way-cycleway-on-road':
      return m.reroute_reason_cycleway_on_road()
    case 'not-routed':
      return m.reroute_reason_not_routed()
    case 'against-node-order':
      return m.reroute_reason_against_order()
    case 'one-way-backward':
      return m.reroute_reason_one_way_backward()
    case 'loop':
      return m.reroute_reason_loop()
  }
}

/** A length for the messages, which add the unit: one decimal */
function metres(value: number): string {
  return value.toFixed(1)
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

/** The word for one of the roles the plan offers */
function roleText(role: string): string {
  if (role === 'forward') return m.reroute_role_forward()
  if (role === 'backward') return m.reroute_role_backward()
  return m.reroute_role_empty()
}

/** Which occurrence of a stretch that occurs more than once in the route is meant */
function OccurrenceChoice({ preview }: { preview: RoutePreview }) {
  const chosen = preview.stretches.indexOf(preview.stretch!)
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-medium">{m.reroute_occurrence_title()}</legend>
      <div className="flex flex-wrap gap-1">
        {preview.stretches.map((_, index) => (
          <button
            key={index}
            type="button"
            aria-pressed={index === chosen}
            className={BUTTON}
            onClick={() => rerouteActions.setOccurrence(index)}
          >
            {m.reroute_occurrence({ number: index + 1 })}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** One direction question of the plan: the way, and the roles it offers (the suggestion when nothing was chosen) */
function RoleQuestions({
  questions,
  choices,
}: {
  questions: RoleQuestion[]
  choices: Readonly<Record<number, string>>
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{m.reroute_roles_title()}</legend>
      <p className={HINT}>{m.reroute_roles_hint()}</p>
      {questions.map((question) => {
        const chosen = choices[question.segment] ?? question.suggested
        return (
          <div key={question.segment} className="flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs">{question.wayId}</span>
              <span className="flex gap-1">
                {question.options.map((role) => (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={chosen === role}
                    className={BUTTON}
                    onClick={() => rerouteActions.setRoleChoice(question.segment, role)}
                  >
                    {roleText(role)}
                  </button>
                ))}
              </span>
            </div>
            <span className={HINT}>{roleReasonText(question.reason)}</span>
          </div>
        )
      })}
    </fieldset>
  )
}

/** The numbers of what the plan changes */
function Report({ preview, plan }: { preview: RoutePreview; plan: ReroutePlan }) {
  const added = plan.addedMembers.filter(
    (member) => !preview.expectedIds.includes(member.fromWayId),
  )
  const review = plan.pointsToReview.filter((point) => point.far)
  return (
    <ul className="flex flex-col gap-0.5 text-sm">
      <li>
        {m.reroute_length({
          before: metres(preview.oldLengthM),
          after: metres(plan.lengthM),
        })}
      </li>
      <li>{m.reroute_added({ count: added.length })}</li>
      <li>{m.reroute_removed({ count: plan.removedMembers.length })}</li>
      <li>{m.reroute_split({ count: plan.splitWays.length })}</li>
      <li>{m.reroute_touched({ count: plan.otherRelationsTouched.length })}</li>
      {review.length > 0 && <li>{m.reroute_review({ count: review.length })}</li>}
    </ul>
  )
}

/** A way's name for the lists: its name, its ref, or "Way without a name", with its kind where the name is missing */
function wayName(graph: Graph, id: EntityID): string {
  const way = graph.hasEntity(id)
  const tags = way instanceof OsmWay ? way.tags : {}
  return (
    tags.name ?? tags.ref ?? `${m.reroute_unnamed()}${tags.highway ? ` (${tags.highway})` : ''}`
  )
}

/** The ways' names, each name once, with how often it occurs */
function namesOf(graph: Graph, ids: readonly EntityID[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const id of ids) {
    const name = wayName(graph, id)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts].map(([name, count]) => ({ name, count }))
}

/** The colours of the map's edits display (renderer layers.ts EDIT_COLOUR), as the way table uses them */
const OUT_CLASS = 'bg-[#ff7e2e]/25 text-red-900 line-through dark:bg-[#ff7e2e]/15 dark:text-red-200'
const IN_CLASS = 'bg-[#85ff67]/35 text-emerald-950 dark:bg-[#85ff67]/15 dark:text-emerald-100'

/** What leaves the route and what joins it, by the ways' names */
function Changes({ graph, preview }: { graph: Graph; preview: RoutePreview }) {
  const { removed, added } = changedWays(graph, preview)
  const lists = [
    { title: m.reroute_out({ count: removed.length }), ids: removed, tone: OUT_CLASS, mark: '−' },
    { title: m.reroute_in({ count: added.length }), ids: added, tone: IN_CLASS, mark: '+' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      {lists.map((list) => (
        <div key={list.mark} className="flex min-w-0 flex-col gap-1">
          <span className="font-medium">{list.title}</span>
          <ul
            className="flex flex-col gap-0.5"
            data-reroute-list={list.mark === '+' ? 'in' : 'out'}
          >
            {namesOf(graph, list.ids).map(({ name, count }) => (
              <li key={name} className={`truncate rounded px-1.5 py-0.5 ${list.tone}`} title={name}>
                <span aria-hidden className="mr-1 font-mono">
                  {list.mark}
                </span>
                {name}
                {count > 1 && ` ×${count}`}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** Whether the plan changes nothing: no way leaves or joins, and no way is split */
function changesNothing(graph: Graph, preview: RoutePreview, plan: ReroutePlan): boolean {
  const { removed, added } = changedWays(graph, preview)
  return removed.length === 0 && added.length === 0 && plan.splitWays.length === 0
}

export type ReroutePanelProps = {
  editor: Editor
  graph: Graph
  preview: RoutePreview
  apply: RerouteApply
  readOnly?: (id: EntityID) => boolean
}

/** The panel of the reroute under way */
export function ReroutePanel({ editor, graph, preview, apply, readOnly }: ReroutePanelProps) {
  const roleChoices = useRerouteRoleChoices()
  const vias = useRerouteVias()
  const [failure, setFailure] = useState<RerouteRefusal>()
  const relation = graph.hasEntity(preview.relationId)
  const name = relation instanceof OsmRelation ? routeLabel(relation) : preview.relationId
  const plan = preview.plan?.ok ? preview.plan : undefined
  const unchanged = plan !== undefined && changesNothing(graph, preview, plan)
  const request = unchanged ? undefined : requestOf(preview)
  const onApply = () => {
    if (!request) return
    const result = apply.apply(editor, request, readOnly)
    if (result.ok) {
      setFailure(undefined)
      rerouteActions.stop()
    } else {
      setFailure(result.reason)
    }
  }
  const both = preview.start !== undefined && preview.end !== undefined
  const step = stepText(preview)

  return (
    <section
      aria-label={m.reroute_panel_title({ name })}
      data-reroute-panel
      className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-3 text-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <h2 className="truncate text-sm font-semibold" title={name}>
        {m.reroute_panel_title({ name })}
      </h2>
      {both && <p className={HINT}>{m.reroute_panel_hint({ ...device() })}</p>}
      {(!both || !plan || unchanged) && (
        <p className={HINT} data-reroute-step>
          {unchanged ? m.reroute_unchanged() : step}
        </p>
      )}
      {preview.stretches.length > 1 && <OccurrenceChoice preview={preview} />}
      {plan && !unchanged && <Changes graph={graph} preview={preview} />}
      {plan && <Report preview={preview} plan={plan} />}
      {plan && !unchanged && plan.rolesToAsk.length > 0 && (
        // folded: each question has a suggestion, which Apply takes when nothing is chosen
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            {m.reroute_roles_title()} ({plan.rolesToAsk.length})
          </summary>
          <div className="pt-2">
            <RoleQuestions questions={plan.rolesToAsk} choices={roleChoices} />
          </div>
        </details>
      )}
      {failure && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {refusalText(failure)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={PRIMARY} disabled={!request} onClick={onApply}>
          {m.reroute_apply()}
        </button>
        <button type="button" className={BUTTON} onClick={() => rerouteActions.stop()}>
          {m.reroute_cancel()}
        </button>
        {vias.length > 0 && (
          <button type="button" className={BUTTON} onClick={() => rerouteActions.clearVias()}>
            {m.reroute_vias_clear()}
          </button>
        )}
      </div>
    </section>
  )
}

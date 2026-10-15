// The inspector section of a route relation: the button that starts a reroute, and while one is under way, the panel
// with the steps, the report of what the plan changes, the direction questions, the occurrence choice, and Apply and
// Cancel. Apply goes through the port, which plans again on the data as it is then. The plan and the port give codes;
// the words are the module's texts, chosen here.
import type { InspectorSectionProps } from '@osm-editor-kit/maid-ui'
import { useState } from 'react'
import type { RerouteApply, RerouteRefusal } from './apply-port.ts'
import { m } from './messages.ts'
import type { ReroutePlan, RoleQuestion, RoleReason } from './plan.ts'
import { rerouteActions, useRerouteRoleChoices } from './reroute-store.ts'
import { requestOf, type RoutePreview } from './route.ts'
import { useReroute } from './use-reroute.ts'

export type RerouteSectionProps = InspectorSectionProps & { apply: RerouteApply }

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
  if (!preview.start) return m.reroute_step_start()
  if (!preview.end) return m.reroute_step_end()
  if (preview.route && !preview.route.ok) return routeReasonText(preview.route.reason)
  if (!preview.stretch) return m.reroute_no_member()
  if (preview.plan && !preview.plan.ok) return refusalText(preview.plan.reason)
  return m.reroute_step_done()
}

/** The word for one of the roles the plan offers */
function roleText(role: string): string {
  if (role === 'forward') return m.reroute_role_forward()
  if (role === 'backward') return m.reroute_role_backward()
  return m.reroute_role_empty()
}

function StartReroute({ relationId }: { relationId: EntityID }) {
  return (
    <div className="flex flex-col gap-2">
      <p className={HINT}>{m.reroute_hint()}</p>
      <div>
        <button type="button" className={BUTTON} onClick={() => rerouteActions.begin(relationId)}>
          {m.reroute_start()}
        </button>
      </div>
    </div>
  )
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

export function RerouteSection({ entity, editor, apply, readOnly }: RerouteSectionProps) {
  const { relationId, preview } = useReroute(editor, readOnly)
  const roleChoices = useRerouteRoleChoices()
  const [failure, setFailure] = useState<RerouteRefusal>()
  if (relationId !== entity.id || !preview) return <StartReroute relationId={entity.id} />

  const request = requestOf(preview)
  const plan = preview.plan?.ok ? preview.plan : undefined
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

  return (
    <div className="flex flex-col gap-3">
      <p className={HINT}>{stepText(preview)}</p>
      {preview.stretches.length > 1 && <OccurrenceChoice preview={preview} />}
      {plan && <Report preview={preview} plan={plan} />}
      {plan && plan.rolesToAsk.length > 0 && (
        <RoleQuestions questions={plan.rolesToAsk} choices={roleChoices} />
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
      </div>
    </div>
  )
}

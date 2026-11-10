/**
 * Edit menu entries "Move sidewalk tags to the left sidewalk" and the like: one per kind (sidewalk, cycle track) and
 * side (left, right, both). Offered on one selected road whose side is `separate` and still has attributes.
 */
import type { Operation, OperationContext } from '@osm-editor-kit/maid-operations'
import { m } from './messages.ts'
import { type MoveRefusal, moveApplies, moveSideTagsPlan } from './move-side-tags.ts'
import type { Side, SidePrefix } from './side-tags.ts'

type SideChoice = Side | 'both'

const SIDES_OF: Record<SideChoice, readonly Side[]> = {
  left: ['left'],
  right: ['right'],
  both: ['left', 'right'],
}

function label(prefix: SidePrefix, side: SideChoice) {
  const labels = {
    sidewalk: {
      left: m.move_sidewalk_left_label,
      right: m.move_sidewalk_right_label,
      both: m.move_sidewalk_both_label,
    },
    cycleway: {
      left: m.move_cycleway_left_label,
      right: m.move_cycleway_right_label,
      both: m.move_cycleway_both_label,
    },
  }
  return labels[prefix][side]()
}

function sideName(side: Side) {
  return side === 'left' ? m.side_left() : m.side_right()
}

/** The sentence for a refusal, read when shown */
export function refusalSentence(prefix: SidePrefix, refusal: MoveRefusal): string {
  if (refusal.reason === 'no_way')
    return prefix === 'sidewalk'
      ? m.move_refused_no_sidewalk({ side: sideName(refusal.side) })
      : m.move_refused_no_cycleway({ side: sideName(refusal.side) })
  return m.move_refused_different_value({ key: refusal.key, side: sideName(refusal.side) })
}

function roadOf(context: OperationContext): string | undefined {
  const [id] = context.selected
  return context.selected.length === 1 && id?.startsWith('w') ? id : undefined
}

function moveSideTagsOperation(prefix: SidePrefix, side: SideChoice): Operation {
  const sides = SIDES_OF[side]
  const applies = (context: OperationContext) => {
    const roadId = roadOf(context)
    return roadId !== undefined && moveApplies(context.graph, roadId, prefix, sides)
  }
  return {
    id: `move-${prefix}-tags-${side}`,
    get label() {
      return label(prefix, side)
    },
    icon: 'iD-operation-extract',
    group: 'structure',
    applies,
    disabled: (context) => {
      if (!applies(context)) return undefined
      const plan = moveSideTagsPlan(context.graph, roadOf(context)!, prefix, sides)
      return 'refused' in plan ? refusalSentence(prefix, plan.refused) : undefined
    },
    run: (context) => {
      const roadId = roadOf(context)!
      const plan = moveSideTagsPlan(context.graph, roadId, prefix, sides)
      if ('refused' in plan)
        throw new Error(`Cannot move the ${prefix} tags: ${plan.refused.reason}`)
      return {
        actions: plan.actions,
        annotation:
          prefix === 'sidewalk' ? m.move_sidewalk_annotation() : m.move_cycleway_annotation(),
        // the ways that got the tags, so the mapper sees them at once; while some tags stay on the road (their way has
        // another value) the road stays selected, so the mapper sees what is left to decide
        select:
          plan.kept.length || !plan.ways.length ? undefined : () => plan.ways.map((way) => way.id),
      }
    },
  }
}

export const moveSideTagsOperations: readonly Operation[] = (
  ['sidewalk', 'cycleway'] as const
).flatMap((prefix) =>
  (['both', 'left', 'right'] as const).map((side) => moveSideTagsOperation(prefix, side)),
)

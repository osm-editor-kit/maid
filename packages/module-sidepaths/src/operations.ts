/**
 * Edit menu entries "Move sidewalk tags to the left sidewalk" and the like: one per kind (sidewalk, cycle track) and
 * side (left, right, both). Offered on one selected road whose side is `separate` and still has attributes.
 */
import type { Graph } from '@osm-editor-kit/maid-model'
import type {
  Operation,
  OperationChoice,
  OperationContext,
  OperationPreviewLine,
} from '@osm-editor-kit/maid-operations'
import type { SeparateWay } from './find.ts'
import { m } from './messages.ts'
import { type MoveRefusal, moveApplies, moveSideTagsPlan } from './move-side-tags.ts'
import { type SideOption, sideOptions } from './side-options.ts'
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

/** The options of each side per graph, so that the edit menu, asked often for one graph, searches once */
const optionsCache = new WeakMap<Graph, Map<string, SideOption[]>>()

function cachedOptions(graph: Graph, roadId: string, prefix: SidePrefix, side: Side) {
  let byKey = optionsCache.get(graph)
  if (!byKey) {
    byKey = new Map()
    optionsCache.set(graph, byKey)
  }
  const key = `${roadId} ${prefix} ${side}`
  let options = byKey.get(key)
  if (!options) {
    options = sideOptions(graph, roadId, prefix, side)
    byKey.set(key, options)
  }
  return options
}

/** Every pick of one option per side, as `side:key|side:key`, nearest first; empty when no side has a choice */
function choicesOf(graph: Graph, roadId: string, prefix: SidePrefix, sides: readonly Side[]) {
  const perSide = sides.map((side) => ({
    side,
    options: cachedOptions(graph, roadId, prefix, side),
  }))
  if (perSide.every(({ options }) => options.length <= 1)) return []
  let picks: Array<Array<{ side: Side; option: SideOption }>> = [[]]
  for (const { side, options } of perSide)
    picks = picks.flatMap((pick) => options.map((option) => [...pick, { side, option }]))
  return picks
}

const metres = (value: number) => String(Math.max(1, Math.round(value)))

/** "4 m from the road, 80 m long"; for both sides "left 4 m, right 6 m" */
function choiceLabel(pick: Array<{ side: Side; option: SideOption }>) {
  if (pick.length === 1) {
    const { option } = pick[0]!
    return m.choice_distance({ distance: metres(option.distance), length: metres(option.length) })
  }
  const of = (side: Side) => metres(pick.find((p) => p.side === side)?.option.distance ?? 0)
  return m.choice_both({ left: of('left'), right: of('right') })
}

const choiceId = (pick: Array<{ side: Side; option: SideOption }>) =>
  pick.map(({ side, option }) => `${side}:${option.key}`).join('|')

/** The ways of each side a choice picked; without a choice (or an unknown one), none: every side gets all its ways */
function pickedWays(
  context: OperationContext,
  roadId: string,
  prefix: SidePrefix,
  sides: readonly Side[],
) {
  const picked: Partial<Record<Side, SeparateWay[]>> = {}
  if (context.choice === undefined) return picked
  for (const part of context.choice.split('|')) {
    const [side, key] = part.split(':') as [Side, string]
    if (!sides.includes(side)) continue
    const option = cachedOptions(context.graph, roadId, prefix, side).find((o) => o.key === key)
    if (option) picked[side] = option.ways.map(({ id, reversed }) => ({ id, reversed }))
  }
  return picked
}

function moveSideTagsOperation(prefix: SidePrefix, side: SideChoice): Operation {
  const sides = SIDES_OF[side]
  const applies = (context: OperationContext) => {
    const roadId = roadOf(context)
    return roadId !== undefined && moveApplies(context.graph, roadId, prefix, sides)
  }
  const planOf = (context: OperationContext) => {
    const roadId = roadOf(context)!
    return moveSideTagsPlan(
      context.graph,
      roadId,
      prefix,
      sides,
      pickedWays(context, roadId, prefix, sides),
    )
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
      const plan = planOf(context)
      return 'refused' in plan ? refusalSentence(prefix, plan.refused) : undefined
    },
    // two sidewalks along the same stretch of one side: the mapper picks one in a flyout
    choices: (context): OperationChoice[] => {
      if (!applies(context)) return []
      return choicesOf(context.graph, roadOf(context)!, prefix, sides).map((pick) => ({
        id: choiceId(pick),
        label: choiceLabel(pick),
      }))
    },
    // the ways that get the tags, marked in blue: the picked ones, or every candidate while the flyout is not open
    preview: (context): OperationPreviewLine[] => {
      const roadId = roadOf(context)!
      const picked = pickedWays(context, roadId, prefix, sides)
      return sides.flatMap((s) => {
        const ids = new Set(
          picked[s]?.map((way) => way.id) ??
            cachedOptions(context.graph, roadId, prefix, s).flatMap((o) => o.ways.map((w) => w.id)),
        )
        const options = cachedOptions(context.graph, roadId, prefix, s)
        const ways = new Map(options.flatMap((o) => o.ways).map((way) => [way.id, way]))
        return [...ids].flatMap((id) => {
          const way = ways.get(id)
          return way ? [{ line: way.locs, style: 'mark' as const }] : []
        })
      })
    },
    run: (context) => {
      const plan = planOf(context)
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

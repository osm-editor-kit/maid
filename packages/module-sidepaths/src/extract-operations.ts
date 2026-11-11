/**
 * Edit menu entries of iD-Radnetz's "Extract …" flyout, as plain entries (Maid's edit menu has no flyout): "Extract
 * cycle tracks" (both sides), "Extract left cycle track", the same for sidewalks and for both as one path, and
 * "Extract and merge cycle tracks" (both sides, left, right). Offered on one selected road that has such a side.
 */
import { type Graph, OsmWay } from '@osm-editor-kit/maid-model'
import type { Operation, OperationContext } from '@osm-editor-kit/maid-operations'
import { type ExtractVariant, extractOptions } from '@tilda-geo/bicycle-infrastructure-tagging'
import {
  type ExtractPlan,
  type ExtractProblem,
  extractMergePlan,
  extractPlan,
} from './extract-merge.ts'
import { m } from './messages.ts'
import type { Side } from './side-tags.ts'
import { signRules } from './sign-rules.ts'

type SideChoice = Side | 'both'

/** Right first, as the fork extracts both sides */
const SIDES_OF: Record<SideChoice, readonly Side[]> = {
  both: ['right', 'left'],
  left: ['left'],
  right: ['right'],
}

function roadOf(context: OperationContext): OsmWay | undefined {
  const [id] = context.selected
  if (context.selected.length !== 1 || !id?.startsWith('w')) return undefined
  const way = context.graph.hasEntity(id)
  return way instanceof OsmWay && !way.isClosed() ? way : undefined
}

/** Whether the road offers `variant` on every side of the choice; "both" leaves protected lanes out, as the fork does */
function offers(road: OsmWay, variant: ExtractVariant, choice: SideChoice) {
  const options = extractOptions(road.tags).filter(
    (option) => option.variant === variant && (choice !== 'both' || !option.protectedLane),
  )
  return SIDES_OF[choice].every((side) => options.some((option) => option.side === side))
}

const sideName = (side: Side) => (side === 'left' ? m.side_left() : m.side_right())

/** The sentence for a problem, read when shown */
export function problemSentence(problem: ExtractProblem): string {
  const side = sideName(problem.side)
  switch (problem.reason) {
    case 'closed':
      return m.extract_refused_closed()
    case 'too_short':
      return m.extract_refused_too_short()
    case 'no_sidewalk':
      return m.extract_refused_no_sidewalk({ side })
    case 'apart':
      return m.extract_refused_apart({ side })
    case 'lengths':
      return m.extract_refused_lengths({ side })
    case 'different_values':
      return m.extract_refused_different_values({ side, key: problem.key ?? '' })
    case 'mixed':
      return m.extract_refused_no_sidewalk({ side })
    case 'incomplete':
    case 'not_a_way':
      return m.extract_refused_incomplete()
  }
}

/** The plan for one graph and entry, made once: the edit menu asks `disabled` on every change of the pointer */
const plans = new WeakMap<Graph, Map<string, ExtractPlan>>()

function cachedPlan(graph: Graph, key: string, make: () => ExtractPlan): ExtractPlan {
  let byKey = plans.get(graph)
  if (!byKey) {
    byKey = new Map()
    plans.set(graph, byKey)
  }
  let plan = byKey.get(key)
  if (!plan) {
    plan = make()
    byKey.set(key, plan)
  }
  return plan
}

type Entry = {
  id: string
  label: () => string
  annotation: () => string
  applies: (road: OsmWay) => boolean
  plan: (graph: Graph, roadId: string) => ExtractPlan
}

function operationOf(entry: Entry): Operation {
  const plan = (context: OperationContext, road: OsmWay) =>
    cachedPlan(context.graph, `${entry.id} ${road.id}`, () => entry.plan(context.graph, road.id))
  return {
    id: entry.id,
    get label() {
      return entry.label()
    },
    icon: 'iD-operation-extract',
    group: 'structure',
    applies: (context) => {
      const road = roadOf(context)
      return road !== undefined && entry.applies(road)
    },
    disabled: (context) => {
      const road = roadOf(context)
      if (!road || !entry.applies(road)) return undefined
      // a traffic sign decides the new way's highway and access: wait for its rules (loaded at setup)
      if (!signRules()) return m.extract_loading()
      const result = plan(context, road)
      return 'problem' in result ? problemSentence(result.problem) : undefined
    },
    run: (context) => {
      const result = plan(context, roadOf(context)!)
      if ('problem' in result) throw new Error(`${entry.id}: ${result.problem.reason}`)
      return {
        actions: [result.action],
        annotation: entry.annotation(),
        select: () => result.selected,
      }
    },
  }
}

const LABELS = {
  cycleway: {
    both: () => m.extract_cycleway_both_label(),
    left: () => m.extract_cycleway_left_label(),
    right: () => m.extract_cycleway_right_label(),
  },
  sidewalk: {
    both: () => m.extract_sidewalk_both_label(),
    left: () => m.extract_sidewalk_left_label(),
    right: () => m.extract_sidewalk_right_label(),
  },
  path: {
    both: () => m.extract_path_both_label(),
    left: () => m.extract_path_left_label(),
    right: () => m.extract_path_right_label(),
  },
  merge: {
    both: () => m.extract_merge_both_label(),
    left: () => m.extract_merge_left_label(),
    right: () => m.extract_merge_right_label(),
  },
}

const CHOICES: readonly SideChoice[] = ['both', 'left', 'right']

const extractEntries: Entry[] = (['cycleway', 'sidewalk', 'path'] as const).flatMap((variant) =>
  CHOICES.map((choice) => ({
    id: `extract-${variant}-${choice}`,
    label: LABELS[variant][choice],
    annotation: () => m.extract_annotation(),
    applies: (road: OsmWay) => offers(road, variant, choice),
    plan: (graph: Graph, roadId: string) =>
      extractPlan(graph, roadId, variant, SIDES_OF[choice], signRules() ?? {}),
  })),
)

const mergeEntries: Entry[] = CHOICES.map((choice) => ({
  id: `extract-merge-${choice}`,
  label: LABELS.merge[choice],
  annotation: () => m.extract_merge_annotation(),
  applies: (road: OsmWay) => offers(road, 'cycleway', choice),
  plan: (graph: Graph, roadId: string) =>
    extractMergePlan(graph, roadId, SIDES_OF[choice], signRules() ?? {}),
}))

export const extractOperations: readonly Operation[] = [...extractEntries, ...mergeEntries].map(
  operationOf,
)

/**
 * Plans of the extract entries: extract one or both sides, and extract the cycle track and merge it right away with the
 * footway that already runs along it (iD-Radnetz's `actionExtractMergeSidepaths`, WORKDOC features 17 and 30). Each
 * plan is tried on a copy of the graph, so the edit menu knows why an entry is disabled before anything changes.
 */
import { type Action, Graph, OsmWay } from '@osm-editor-kit/maid-model'
import type { OperationPreviewLine } from '@osm-editor-kit/maid-operations'
import { type ExtractVariant, partKind } from '@tilda-geo/bicycle-infrastructure-tagging'
import {
  actionExtractSidepath,
  type ExtractRefusal,
  extractRefusal,
  roadLocs,
  type SignRules,
} from './extract.ts'
import { footwaysAlong } from './find.ts'
import { mergeSidepaths, mergeSidepathsSelection } from './merge.ts'
import type { Side } from './side-tags.ts'

/** Why an extraction cannot run, and on which side and in which step */
export type ExtractProblem = {
  reason: ExtractRefusal | 'no_sidewalk' | 'apart' | 'mixed' | 'lengths' | 'different_values'
  /** The tag of `different_values` */
  key?: string
  side: Side
  step: 'extract' | 'merge'
}

export type ExtractPlan =
  | { problem: ExtractProblem }
  | {
      action: Action
      /** What is selected afterwards: the new ways, or the paths they were merged into */
      selected: string[]
      /** `key=value` tags of the deleted footways that lost against the surviving way's value */
      dropped: string[]
      /** What the edit menu shows while the entry is hovered: the new ways as helper lines, the merged paths marked */
      preview: OperationPreviewLine[]
    }

type Steps = (g: Graph) => {
  problem?: ExtractProblem
  selected: string[]
  dropped: string[]
  preview?: OperationPreviewLine[]
}

/** A way of the trial graph as a preview line */
function lineOf(g: Graph, id: string, style: 'mark' | 'helper'): OperationPreviewLine[] {
  const way = g.hasEntity(id)
  const locs = way instanceof OsmWay ? roadLocs(g, way) : undefined
  return locs && locs.length > 1 ? [{ line: locs, style }] : []
}

/** Runs `steps` on a copy of the graph; the plan's action runs them again on the real one */
function tryOn(graph: Graph, steps: Steps): ExtractPlan {
  const trial = steps(new Graph(graph))
  if (trial.problem) return { problem: trial.problem }
  return {
    action: (g: Graph) => {
      steps(g)
      return g.commit()
    },
    selected: trial.selected,
    dropped: trial.dropped,
    preview: trial.preview ?? [],
  }
}

/** Extract `variant` on each of `sides`, right first, as the fork does: one undo step, all new ways selected */
export function extractPlan(
  graph: Graph,
  roadId: string,
  variant: ExtractVariant,
  sides: readonly Side[],
  rules: SignRules,
): ExtractPlan {
  // the new ways' ids are made once, so the trial and the real run select the same ways
  const actions = sides.map((side) => ({
    side,
    action: actionExtractSidepath(graph, roadId, variant, side, rules),
  }))
  return tryOn(graph, (g) => {
    for (const { side, action } of actions) {
      const refusal = extractRefusal(g, roadId)
      if (refusal)
        return { problem: { reason: refusal, side, step: 'extract' }, selected: [], dropped: [] }
      action(g)
    }
    const selected = actions.map(({ action }) => action.wayId)
    return { selected, dropped: [], preview: selected.flatMap((id) => lineOf(g, id, 'helper')) }
  })
}

const isFoot = (tags: Readonly<Record<string, string>>) => partKind(tags) === 'foot'

/**
 * Extract the cycle track of each side and merge it with the footway that runs along it. Refused as a whole when a step
 * fails: unlike the fork, which keeps a half done extraction, Maid's edit menu says why before anything changes.
 */
export function extractMergePlan(
  graph: Graph,
  roadId: string,
  sides: readonly Side[],
  rules: SignRules,
): ExtractPlan {
  const actions = sides.map((side) => ({
    side,
    action: actionExtractSidepath(graph, roadId, 'cycleway', side, rules),
  }))
  return tryOn(graph, (g) => {
    const selected: string[] = []
    const dropped = new Set<string>()
    const preview: OperationPreviewLine[] = []
    const fail = (problem: ExtractProblem) => ({ problem, selected: [], dropped: [] })
    for (const { side, action } of actions) {
      const refusal = extractRefusal(g, roadId)
      if (refusal) return fail({ reason: refusal, side, step: 'extract' })
      action(g)
      // where the cycle track goes, and the footways it is merged into
      preview.push(...lineOf(g, action.wayId, 'helper'))
      const footIds = footwaysAlong(g, action.wayId, isFoot)
      preview.push(...footIds.flatMap((id) => lineOf(g, id, 'mark')))
      if (!footIds.length) return fail({ reason: 'no_sidewalk', side, step: 'merge' })
      const selection = mergeSidepathsSelection(g, [action.wayId, ...footIds])
      if (!selection) return fail({ reason: 'no_sidewalk', side, step: 'merge' })
      if (selection.disabled) {
        const key = 'key' in selection ? selection.key : undefined
        return fail({ reason: selection.disabled, key, side, step: 'merge' })
      }
      const result = mergeSidepaths(g, selection, rules)
      selected.push(...result.survivorIds)
      for (const tag of result.dropped) dropped.add(tag)
    }
    return { selected, dropped: [...dropped], preview }
  })
}

/**
 * Merge (C) for two closed areas: one outline. The line merge of the operations package keeps C for lines, and the two
 * never apply to the same selection, so the key runs whichever applies.
 */
import { OsmWay } from '@osm-editor-kit/maid-model'
import type { Operation, OperationContext } from '@osm-editor-kit/maid-operations'
import { m } from '../messages.ts'
import { sentenceOf } from '../shared/refusals.ts'
import { mergePlan, type MergeRefusal } from './merge.ts'

/** The sentence for each reason two areas cannot be merged. Read when shown, so it follows the page's language. */
export const refusalSentence = sentenceOf<MergeRefusal>({
  not_two_areas: () => m.merge_refused_not_two_areas(),
  multipolygon: () => m.merge_refused_multipolygon(),
  conflicting_tags: () => m.merge_refused_conflicting_tags(),
  conflicting_relations: () => m.merge_refused_conflicting_relations(),
  contained: () => m.merge_refused_contained(),
  not_touching: () => m.merge_refused_not_touching(),
  shared_nodes_outside: () => m.merge_refused_shared_nodes_outside(),
  tagged_nodes: () => m.merge_refused_tagged_nodes(),
  not_simple: () => m.merge_refused_not_simple(),
  too_many_nodes: () => m.merge_refused_too_many_nodes(),
})

/** Exactly two selected ways that are closed areas. A closed line (a loop of road) is not an area, so it is not offered here. */
function selectedAreas(context: OperationContext): boolean {
  const { graph, selected } = context
  if (selected.length !== 2) return false
  return selected.every((id) => {
    const entity = graph.hasEntity(id)
    return entity instanceof OsmWay && entity.isClosed() && entity.geometry(graph) === 'area'
  })
}

/** Merge areas: the union of two closed areas as one outline. Afterwards the survivor is selected. */
export const mergeAreasOperation: Operation = {
  id: 'merge-areas',
  get label() {
    return m.merge_label()
  },
  // iD's merge icon, the one the line merge shows
  icon: 'iD-operation-merge',
  shortcut: 'c',
  applies: selectedAreas,
  disabled: (context) => {
    if (!selectedAreas(context)) return undefined
    const plan = mergePlan(context.graph, context.selected)
    return 'refused' in plan ? refusalSentence(plan.refused) : undefined
  },
  run: (context) => {
    const plan = mergePlan(context.graph, context.selected)
    if (!('action' in plan))
      throw new Error(`The merge-areas operation does not apply to this selection: ${plan.refused}`)
    return {
      actions: [plan.action],
      annotation: m.merge_annotation(),
      select: () => [plan.survivor],
    }
  },
}

/**
 * Merge (C) for two closed areas: one outline. The line merge of the operations package keeps C for lines, and the two
 * never apply to the same selection, so the key runs whichever applies.
 */
import { OsmWay } from '@osm-editor-kit/maid-model'
import { relationRows, tagRows } from '@osm-editor-kit/maid-operations'
import type { Operation, OperationContext } from '@osm-editor-kit/maid-operations'
import { m } from '../messages.ts'
import { sentenceOf } from '../shared/refusals.ts'
import {
  combinedValue,
  geometryRefusal,
  mergePlan,
  type MergeOptions,
  type MergeRefusal,
} from './merge.ts'

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

/**
 * Two areas that overlap or share an edge, as one outline. Apart areas and an area inside another are not this
 * operation's: the core Merge makes a multipolygon of them. That is decided by their place alone, so it holds for
 * any tags: a contained pair with different tags is refused by the tags first, and must not be taken for a union.
 */
function unionApplies(context: OperationContext): boolean {
  if (!selectedAreas(context)) return false
  const refusal = geometryRefusal(context.graph, context.selected)
  return refusal !== 'contained' && refusal !== 'not_touching'
}

/**
 * Merge areas: the union of two closed areas as one outline. Afterwards the survivor is selected. It supersedes the core
 * Merge for the areas it applies to, so the edit menu and C show one Merge. With `tags: 'combine'` (the building
 * editor) areas with different tags merge too, as long as no key has two values that do not fit (merge.ts).
 */
export function mergeAreasOperationWith(options: MergeOptions = {}): Operation {
  const combine = options.tags === 'combine'
  return {
    id: 'merge-areas',
    get label() {
      return m.merge_label()
    },
    // iD's merge icon, the one the line merge shows
    icon: 'iD-operation-merge',
    shortcut: 'c',
    group: 'structure',
    supersedes: ['merge'],
    applies: unionApplies,
    disabled: (context) => {
      if (!unionApplies(context)) return undefined
      const plan = mergePlan(context.graph, context.selected, options)
      return 'refused' in plan ? refusalSentence(plan.refused) : undefined
    },
    // the tags or relations that block it, side by side, as the core Merge shows them
    details: (context) => {
      if (!unionApplies(context)) return undefined
      const plan = mergePlan(context.graph, context.selected, options)
      if (!('refused' in plan)) return undefined
      const { refused } = plan
      if (refused !== 'conflicting_tags' && refused !== 'conflicting_relations') return undefined
      const { graph } = context
      const entities = context.selected.map((id) => graph.entity(id))
      // the area merge wants equal tags (area=yes aside) and equal memberships, so every difference shows; when it
      // combines the tags, only the keys whose two values do not fit block it
      let rows =
        refused === 'conflicting_tags'
          ? tagRows(entities, { strict: true, ignore: ['area'] })
          : relationRows(entities, graph, { strict: true })
      if (combine && refused === 'conflicting_tags') {
        const marked = rows.map((row) => ({
          ...row,
          conflict:
            row.label !== 'area' &&
            combinedValue(row.label, row.cells[0], row.cells[1]) === undefined,
        }))
        rows = [...marked.filter((row) => row.conflict), ...marked.filter((row) => !row.conflict)]
      }
      if (rows.length === 0) return undefined
      const columns = entities.map((entity) => ({
        label: entity.tags.name ?? context.presetOf?.(entity, graph)?.name ?? entity.id,
        id: entity.id,
      }))
      return { title: refusalSentence(refused), columns, rows }
    },
    run: (context) => {
      const plan = mergePlan(context.graph, context.selected, options)
      if (!('action' in plan))
        throw new Error(
          `The merge-areas operation does not apply to this selection: ${plan.refused}`,
        )
      return {
        actions: [plan.action],
        annotation: m.merge_annotation(),
        select: () => [plan.survivor],
      }
    },
  }
}

/** Merge areas with equal tags, as iD wants them */
export const mergeAreasOperation: Operation = mergeAreasOperationWith()

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
  geometryRefusal,
  mergePlan,
  tagConflicts,
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

/** Two or more selected ways that are closed areas. A closed line (a loop of road) is not an area, so it is not offered here. */
function selectedAreas(context: OperationContext): boolean {
  const { graph, selected } = context
  if (selected.length < 2) return false
  return selected.every((id) => {
    const entity = graph.hasEntity(id)
    return entity instanceof OsmWay && entity.isClosed() && entity.geometry(graph) === 'area'
  })
}

/**
 * Areas that overlap or share an edge, as one outline. Apart areas and an area inside another are not this
 * operation's: the core Merge makes a multipolygon of them. That is decided by their place alone, so it holds for
 * any tags: a contained pair with different tags is refused by the tags first, and must not be taken for a union.
 */
function unionApplies(context: OperationContext): boolean {
  if (!selectedAreas(context)) return false
  const refusal = geometryRefusal(context.graph, context.selected)
  return refusal !== 'contained' && refusal !== 'not_touching'
}

/** Tags without area=yes, which the merge sets by itself */
function withoutAreaYes(tags: Readonly<Record<string, string>>): Record<string, string> {
  const { area, ...rest } = tags
  return area === 'yes' ? rest : { ...tags }
}

/** Whether two tag sets are the same */
function sameTags(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}

/**
 * Whether the merge gives a tagged area tags it did not have: then the mapper sees the diff and confirms (no change
 * that comes unexpected, Tobias 2026-11-25). An untagged sketch that only gives its shape asks nothing.
 */
function changesTags(context: OperationContext, result: Record<string, string>): boolean {
  const after = withoutAreaYes(result)
  return context.selected.some((id) => {
    const tags = withoutAreaYes(context.graph.entity(id).tags)
    return Object.keys(tags).length > 0 && !sameTags(tags, after)
  })
}

/**
 * Merge areas: the union of two or more closed areas as one outline. Afterwards the survivor is selected. It supersedes
 * the core Merge for the areas it applies to, so the edit menu and C show one Merge. With `tags: 'combine'` (the
 * building editor) areas with different tags merge too: the box beside the menu shows their tags side by side, and
 * C opens a dialog with the tag diff and a choice for each key with two values (`confirm`) before anything changes.
 */
export function mergeAreasOperationWith(options: MergeOptions = {}): Operation {
  const combine = options.tags === 'combine'
  const planOf = (context: OperationContext) =>
    mergePlan(context.graph, context.selected, {
      ...options,
      ...(context.picks && { picks: context.picks }),
    })
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
      const plan = planOf(context)
      return 'refused' in plan ? refusalSentence(plan.refused) : undefined
    },
    // the tags or relations that block it, side by side, as the core Merge shows them; when it combines the tags, the
    // tags it will combine, the keys with two values marked
    details: (context) => {
      if (!unionApplies(context)) return undefined
      const plan = planOf(context)
      const { graph } = context
      const entities = context.selected.map((id) => graph.entity(id))
      const columns = entities.map((entity) => ({
        label: entity.tags.name ?? context.presetOf?.(entity, graph)?.name ?? entity.id,
        id: entity.id,
      }))
      if (!('refused' in plan)) {
        if (!combine || !changesTags(context, plan.tags)) return undefined
        const conflicts = new Set(tagConflicts(graph, context.selected).map((c) => c.key))
        const marked = tagRows(entities, { strict: true, ignore: ['area'] }).map((row) => ({
          ...row,
          conflict: conflicts.has(row.label),
        }))
        const rows = [
          ...marked.filter((row) => row.conflict),
          ...marked.filter((row) => !row.conflict),
        ]
        return { title: m.merge_details_title(), columns, rows }
      }
      const { refused } = plan
      if (refused !== 'conflicting_tags' && refused !== 'conflicting_relations') return undefined
      // the area merge wants equal tags (area=yes aside) and equal memberships, so every difference shows
      const rows =
        refused === 'conflicting_tags'
          ? tagRows(entities, { strict: true, ignore: ['area'] })
          : relationRows(entities, graph, { strict: true })
      if (rows.length === 0) return undefined
      return { title: refusalSentence(refused), columns, rows }
    },
    confirm: (context) => {
      if (!combine) return undefined
      const plan = planOf(context)
      if ('refused' in plan || !changesTags(context, plan.tags)) return undefined
      const conflicts = tagConflicts(context.graph, context.selected)
      return {
        title: m.merge_confirm_title(),
        text: m.merge_confirm_text({ count: context.selected.length }),
        picks: conflicts,
        before: context.graph.entity(plan.survivor).tags,
        after: plan.tags,
        submit: m.merge_confirm_submit(),
      }
    },
    run: (context) => {
      const plan = planOf(context)
      if (!('action' in plan))
        throw new Error(
          `The merge-areas operation does not apply to this selection: ${plan.refused}`,
        )
      const count = context.selected.length
      return {
        actions: [plan.action],
        annotation: count === 2 ? m.merge_annotation() : m.merge_annotation_many({ count }),
        select: () => [plan.survivor],
      }
    },
  }
}

/** Merge areas with equal tags, as iD wants them */
export const mergeAreasOperation: Operation = mergeAreasOperationWith()

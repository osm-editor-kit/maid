// Helpers for the parking operations: the selected roads, and the change of their tags as actions
import { actionChangeTags } from '@osm-editor-kit/maid-model'
import type { OperationContext, OperationResult } from '@osm-editor-kit/maid-operations'
import { applyEdits, readSide, sideSuffixes, writeSide, type RealSide } from '../sides.ts'

export type Graph = OperationContext['graph']
export type Entity = NonNullable<ReturnType<Graph['hasEntity']>>
export type Tags = Readonly<Record<string, string>>
export type { RealSide }

/** The selected roads: the ways with a highway tag, which carry the parking tags */
export function selectedRoads(context: OperationContext): Entity[] {
  const roads: Entity[] = []
  for (const id of context.selected) {
    const entity = context.graph.hasEntity(id)
    if (entity && entity.type === 'way' && entity.tags.highway) roads.push(entity)
  }
  return roads
}

/** Whether a road says anything about a side: a key of its own, or a `both` key */
export function hasParkingOn(tags: Tags, side: RealSide) {
  return [...sideSuffixes(tags)].some((suffix) => readSide(tags, side, suffix) !== undefined)
}

/**
 * The tags with the two sides set to what `values` gives for each suffix the road has, written with `writeSide`: equal
 * sides become `both`, as everywhere in the editor. A suffix whose sides already read these values is left as it is
 * spelled, so an operation that changes no value changes no tag.
 */
export function withSides(
  tags: Tags,
  values: (side: RealSide, suffix: string | undefined) => string | undefined,
): Record<string, string> {
  let next = applyEdits(tags, [])
  for (const suffix of sideSuffixes(tags)) {
    const left = values('left', suffix)
    const right = values('right', suffix)
    if (left === readSide(tags, 'left', suffix) && right === readSide(tags, 'right', suffix))
      continue
    next = applyEdits(next, writeSide(next, 'left', suffix, left))
    next = applyEdits(next, writeSide(next, 'right', suffix, right))
  }
  return next
}

export function sameTags(a: Tags, b: Tags) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) if (a[key] !== b[key]) return false
  return true
}

/**
 * What an operation that rewrites the tags of roads needs: the roads `change` really changes, and the result that
 * writes them as one undo step.
 */
export function tagChange(
  context: OperationContext,
  change: (tags: Tags) => Record<string, string>,
  annotation: string,
): { changes: boolean; result: OperationResult } {
  const actions = []
  for (const road of selectedRoads(context)) {
    const tags = change(road.tags)
    if (!sameTags(tags, road.tags)) actions.push(actionChangeTags(road.id, tags))
  }
  return { changes: actions.length > 0, result: { actions, annotation } }
}

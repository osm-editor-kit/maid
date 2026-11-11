/** Applying a task option to the data: one undo step for each option. */
import type { Editor } from '@osm-editor-kit/maid-core'
import {
  actionAddEntity,
  actionChangeTags,
  actionDeleteMultiple,
  OsmNode,
  OsmWay,
  type Action,
} from '@osm-editor-kit/maid-model'
import { deleteReason } from '@osm-editor-kit/maid-operations'
import {
  applyOption,
  type CreateGeometry,
  isApplied,
  type TaskOption,
} from '@osm-editor-kit/maid-tasks'

export type ApplyOutcome = { ok: true } | { ok: false; reason: 'read-only' | 'missing' | 'applied' }

/**
 * Sets and removes the tags of the option on the features (one, or the several a tag option names), as one undo step
 * (`perform` for each, then `commit` with the annotation). Afterwards `selectedIDs` is selected, else the features.
 * Nothing is changed when one of them is read-only (a filter) or not in the data, or when all of them already have
 * the option's tags; one that has them is left alone.
 */
export function applyTaskOption(
  history: Editor['history'],
  ids: string | readonly string[],
  option: Pick<TaskOption, 'set' | 'remove'>,
  annotation: string,
  readOnly: boolean | ((id: string) => boolean),
  selectedIDs?: readonly string[],
): ApplyOutcome {
  const all = typeof ids === 'string' ? [ids] : ids
  const locked = (id: string) => (typeof readOnly === 'boolean' ? readOnly : readOnly(id))
  if (all.some(locked)) return { ok: false, reason: 'read-only' }
  const entities = all.map((id) => history.staging.graph.hasEntity(id))
  if (entities.some((entity) => !entity)) return { ok: false, reason: 'missing' }
  const open = entities.filter((entity) => entity && !isApplied(entity.tags, option))
  if (open.length === 0) return { ok: false, reason: 'applied' }
  for (const entity of open) {
    if (entity) history.perform(actionChangeTags(entity.id, applyOption(entity.tags, option)))
  }
  history.commit({ annotation, selectedIDs: [...(selectedIDs ?? all)] })
  return { ok: true }
}

/** The result of a `create` option: the id of the new feature (a node, or a way with new nodes) */
export type CreateOutcome = { ok: true; id: string }

/**
 * Adds a new feature with the tags at the geometry, as one undo step, and selects it: a Point becomes a node, a
 * LineString a way of new nodes, a Polygon a closed way (its ring without the repeated last position). The new nodes
 * are not joined to existing ones: moving and connecting is the mapper's.
 */
export function createTaskFeature(
  history: Editor['history'],
  geometry: CreateGeometry,
  tags: Readonly<Record<string, string>>,
  annotation: string,
): CreateOutcome {
  const { context } = history
  const node = (position: readonly number[]) =>
    new OsmNode(context, { loc: [position[0] ?? 0, position[1] ?? 0] })
  const actions: Action[] = []
  let id: string
  if (geometry.type === 'Point') {
    const point = new OsmNode(context, {
      loc: [geometry.coordinates[0], geometry.coordinates[1]],
      tags: { ...tags },
    })
    actions.push(actionAddEntity(point))
    id = point.id
  } else {
    const positions =
      geometry.type === 'LineString'
        ? geometry.coordinates
        : (geometry.coordinates[0] ?? []).slice(0, -1)
    const nodes = positions.map(node)
    for (const each of nodes) actions.push(actionAddEntity(each))
    const ids = nodes.map((each) => each.id)
    const way = new OsmWay(context, {
      nodes: geometry.type === 'Polygon' && ids[0] !== undefined ? [...ids, ids[0]] : ids,
      tags: { ...tags },
    })
    actions.push(actionAddEntity(way))
    id = way.id
  }
  history.perform(...actions)
  history.commit({ annotation, selectedIDs: [id] })
  return { ok: true, id }
}

export type DeleteOutcome =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'read-only'
        | 'missing'
        | 'applied'
        | 'part_of_relation'
        | 'incomplete_relation'
        | 'has_wikidata_tag'
    }

/**
 * Deletes the features as one undo step, as iD's Delete does (a way takes its untagged nodes that nothing else uses
 * along). Refused when one is read-only, when iD would refuse it (part of a protected relation, a Wikidata tag), or
 * when one is not loaded. When none is left in the data but all were loaded once, they are already deleted.
 */
export function deleteTaskFeatures(
  history: Editor['history'],
  ids: readonly string[],
  annotation: string,
  readOnly: (id: string) => boolean,
): DeleteOutcome {
  const graph = history.staging.graph
  const entities = ids.map((id) => graph.hasEntity(id))
  const present = entities.filter((entity) => entity !== undefined)
  if (present.length === 0) {
    const known = ids.length > 0 && ids.every((id) => history.base.graph.hasEntity(id))
    return { ok: false, reason: known ? 'applied' : 'missing' }
  }
  if (present.length < ids.length) return { ok: false, reason: 'missing' }
  if (present.some((entity) => readOnly(entity.id))) return { ok: false, reason: 'read-only' }
  const refusal = deleteReason(present, graph)
  if (refusal) return { ok: false, reason: refusal }
  history.perform(actionDeleteMultiple([...ids]))
  history.commit({ annotation, selectedIDs: [] })
  return { ok: true }
}

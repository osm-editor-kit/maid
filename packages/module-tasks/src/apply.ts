/** Applying a task option to the data: one undo step for each option. */
import type { Editor } from '@osm-editor-kit/maid-core'
import {
  actionAddEntity,
  actionChangeTags,
  actionDeleteMultiple,
  Graph,
  OsmNode,
  OsmWay,
  type Action,
} from '@osm-editor-kit/maid-model'
import {
  circularizeOperation,
  deleteReason,
  type Operation,
  reverseOperation,
  squareOperation,
  straightenOperation,
} from '@osm-editor-kit/maid-operations'
import {
  applyOption,
  type CreateGeometry,
  isApplied,
  type TaskOperation,
  type TaskOption,
} from '@osm-editor-kit/maid-tasks'

export type ApplyOutcome =
  | { ok: true }
  | { ok: false; reason: 'read-only' | 'missing' | 'applied' }
  /** One of the option's operations cannot run on the features: iD's sentence why */
  | { ok: false; reason: 'operation'; message: string }

/** The editor's operations an option names (FORMAT.md `operations`): the edit menu's own, so they behave the same */
const OPERATIONS: Record<TaskOperation, Operation> = {
  reverse: reverseOperation,
  square: squareOperation,
  straighten: straightenOperation,
  circularize: circularizeOperation,
}

/** The label of an option's operation, as the edit menu says it */
export function operationLabel(op: TaskOperation): string {
  return OPERATIONS[op].label
}

/**
 * Why an option's operations cannot run on these features, or undefined when they all can: each is asked on the
 * graph the ones before it leave, on a copy, so nothing changes in part (all or nothing, as FORMAT.md says).
 */
export function operationsRefusal(
  graph: Graph,
  ids: readonly string[],
  operations: TaskOption['operations'],
): string | undefined {
  if (!operations || operations.length === 0) return undefined
  if (ids.some((id) => !graph.hasEntity(id))) return undefined
  // an action may change the graph it gets: run them on a copy
  let copy = new Graph(graph)
  for (const { op } of operations) {
    const operation = OPERATIONS[op]
    const context = { graph: copy, selected: ids }
    if (!operation.applies(context)) return `${operation.label}: not for this feature`
    const reason = operation.disabled(context)
    if (reason !== undefined) return reason
    for (const action of operation.run(context).actions) copy = action(copy)
  }
  return undefined
}

/**
 * What the features look like after an option with operations: their node order and positions. Undo is followed by
 * comparing with it (the tags alone cannot tell, a reverse may change none).
 */
export function shapeSignature(graph: Graph, ids: readonly string[]): string {
  return ids
    .map((id) => {
      const entity = graph.hasEntity(id)
      if (entity instanceof OsmWay) {
        return `${id}:${entity.nodes
          .map((node) => {
            const loc = (graph.hasEntity(node) as OsmNode | undefined)?.loc
            return `${node}@${loc?.join(',') ?? ''}`
          })
          .join(';')}`
      }
      if (entity instanceof OsmNode)
        return `${id}@${entity.loc?.join(',') ?? ''}:${JSON.stringify(entity.tags)}`
      return `${id}:-`
    })
    .join('|')
}

/**
 * Runs the option's operations and then sets and removes its tags on the features (one, or the several a tag option
 * names), as one undo step (`perform` for each, then `commit` with the annotation). Afterwards `selectedIDs` is
 * selected, else the features. Nothing is changed when one of them is read-only (a filter) or not in the data, when an
 * operation cannot run on them, or (without operations) when all of them already have the option's tags; one that
 * has them is left alone.
 */
export function applyTaskOption(
  history: Editor['history'],
  ids: string | readonly string[],
  option: Pick<TaskOption, 'set' | 'remove' | 'operations'>,
  annotation: string,
  readOnly: boolean | ((id: string) => boolean),
  selectedIDs?: readonly string[],
): ApplyOutcome {
  const all = typeof ids === 'string' ? [ids] : ids
  const locked = (id: string) => (typeof readOnly === 'boolean' ? readOnly : readOnly(id))
  if (all.some(locked)) return { ok: false, reason: 'read-only' }
  const entities = all.map((id) => history.staging.graph.hasEntity(id))
  if (entities.some((entity) => !entity)) return { ok: false, reason: 'missing' }
  const operations = option.operations ?? []
  if (operations.length === 0) {
    const open = entities.filter((entity) => entity && !isApplied(entity.tags, option))
    if (open.length === 0) return { ok: false, reason: 'applied' }
  }
  const refusal = operationsRefusal(history.staging.graph, all, operations)
  if (refusal !== undefined) return { ok: false, reason: 'operation', message: refusal }
  // the operations first, each on the graph the one before left, then the tags of what they made
  for (const { op } of operations) {
    const { actions } = OPERATIONS[op].run({ graph: history.staging.graph, selected: all })
    history.perform(...actions)
  }
  for (const id of all) {
    const entity = history.staging.graph.hasEntity(id)
    if (entity && !isApplied(entity.tags, option))
      history.perform(actionChangeTags(entity.id, applyOption(entity.tags, option)))
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

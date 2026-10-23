/**
 * Writing a plan into the editor's graph as one action, in the order of iD #10407: every new element first (empty, so
 * that it has an id), then tags, positions, node lists and members with the file's new ids mapped to the editor's,
 * then the deletes (relations, ways, nodes).
 *
 * Two kinds of writes use it (Tobias, 2026-10-23): on loading, every element that needs no decision, in one undo step;
 * then each decision as the person makes it, in a step of its own (`only` that element, its earlier state reverted
 * first, so that changing a decision replaces it). The ids the first write gave the new elements are passed on.
 *
 * A delete removes exactly the element, as the file lists every deletion itself. Only a delete the person chose
 * although the element is still used goes through the model's delete actions, which also take it out of its ways and
 * relations (iD's behaviour when deleting).
 */
import {
  type Action,
  actionDeleteNode,
  actionDeleteRelation,
  actionDeleteWay,
  type Context,
  Graph,
  type OsmEntity,
  OsmNode,
  OsmRelation,
  OsmWay,
} from '@osm-editor-kit/maid-model'
import { sameElement } from './merge.ts'
import type { Plan } from './plan.ts'
import { keyOf, type OsmElement } from './types.ts'

export type Applied = {
  readonly action: Action
  /** The editor's ids of the new elements, by the file's key (`n-1` → `n-7`) */
  readonly created: ReadonlyMap<string, string>
  /**
   * The editor's ids of everything the action changed: the elements, new ones included, and what the model's delete
   * actions change around a used element (its ways, relations, orphaned nodes). Reverting them all takes the write back
   * (a changed decision). Filled when the action runs.
   */
  readonly touched: ReadonlySet<string>
}

export type ApplyOptions = {
  /** Only these elements (by the file's key); absent: every element that has something to write */
  readonly only?: ReadonlySet<string>
  /** The editor's ids an earlier write gave the file's new elements */
  readonly created?: ReadonlyMap<string, string>
  /** Revert these elements (the editor's ids) to the server's state first: what an earlier decision touched */
  readonly revert?: Iterable<string>
}

export function applyPlan(plan: Plan, context: Context, options: ApplyOptions = {}): Applied {
  const created = new Map<string, string>()
  const touched = new Set<string>()
  const action: Action = (start: Graph) => {
    let graph = start
    created.clear()
    touched.clear()
    for (const [key, id] of options.created ?? []) created.set(key, id)
    const revert = [...(options.revert ?? [])]
    if (revert.length > 0) graph = graph.revert(revert)
    // a copy of the state before the writes: what differs from it at the end is what the action touched
    const before = new Graph(graph)
    const id = (type: OsmElement['type'], ref: number) => {
      const key = keyOf(type, ref)
      return ref < 0 ? (created.get(key) ?? key) : key
    }
    const writes = plan.items.filter(
      (item) => item.result !== undefined && (!options.only || options.only.has(item.key)),
    )
    // 1. the new elements, empty
    for (const item of writes) {
      if (item.change.action !== 'create' || created.has(item.key)) continue
      const { element } = item.change
      const tags = { ...element.tags }
      const entity: OsmEntity =
        element.type === 'node'
          ? new OsmNode(context, { loc: [element.lon ?? 0, element.lat ?? 0], tags })
          : element.type === 'way'
            ? new OsmWay(context, { nodes: [], tags })
            : new OsmRelation(context, { members: [], tags })
      created.set(item.key, entity.id)
      graph = graph.replace(entity)
    }
    // 2. tags and geometry of the new and the changed elements
    for (const item of writes) {
      const result = item.result
      if (result === undefined || result === 'delete') continue
      const current = item.server?.current
      // a decision that comes out as the server's state writes nothing: no empty modify in the upload
      if (
        item.change.action !== 'create' &&
        current &&
        current !== 'deleted' &&
        sameElement(result, current)
      )
        continue
      const entityId = item.change.action === 'create' ? created.get(item.key)! : item.key
      const entity = graph.entity(entityId)
      const tags = { ...result.tags }
      let next: OsmEntity
      if (entity instanceof OsmNode)
        next = entity.update({ tags, loc: [result.lon ?? 0, result.lat ?? 0] })
      else if (entity instanceof OsmWay)
        next = entity.update({ tags, nodes: (result.nodes ?? []).map((ref) => id('node', ref)) })
      else
        next = (entity as OsmRelation).update({
          tags,
          members: (result.members ?? []).map((member) => ({
            id: id(member.type, member.ref),
            type: member.type,
            role: member.role,
          })),
        })
      graph = graph.replace(next)
    }
    // 3. the deletes: relations before the ways and nodes they could hold
    const order = { relation: 0, way: 1, node: 2 }
    const deletes = writes
      .filter((item) => item.result === 'delete')
      .sort((a, b) => order[a.change.element.type] - order[b.change.element.type])
    for (const item of deletes) {
      const entity = graph.hasEntity(item.key)
      if (!entity) continue
      const used = item.conflicts.some(
        (conflict) => conflict.kind === 'delete' && conflict.usedBy.length > 0,
      )
      if (!used) graph = graph.remove(entity)
      else if (entity instanceof OsmNode) graph = actionDeleteNode(entity.id)(graph)
      else if (entity instanceof OsmWay) graph = actionDeleteWay(entity.id)(graph)
      else graph = actionDeleteRelation(entity.id)(graph)
    }
    for (const id of graph.local.entities.keys()) {
      if (graph.hasEntity(id) !== before.hasEntity(id)) touched.add(id)
    }
    return graph
  }
  return { action, created, touched }
}

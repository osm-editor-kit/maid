// Test helpers for the parking operations: plain objects in the shape the operations read, and a graph with
// the methods an action uses, so a test needs no real graph.
import type { OperationContext, OperationResult } from '@osm-editor-kit/maid-operations'
import type { Entity, Graph } from './shared.ts'

export function entity(id: string, tags: Record<string, string>, type = 'way'): Entity {
  const made = {
    id,
    type,
    tags,
    update(props: { tags?: Record<string, string> }) {
      return entity(id, props.tags ?? tags, type)
    },
  }
  return made as unknown as Entity
}

export function graphOf(...entities: Entity[]): Graph {
  const byId = new Map(entities.map((made) => [made.id, made] as const))
  const graph = {
    hasEntity: (id: string) => byId.get(id),
    entity(id: string) {
      const found = byId.get(id)
      if (!found) throw new Error(`no entity ${id}`)
      return found
    },
    replace(changed: Entity | Entity[]) {
      const next = new Map(byId)
      for (const made of [changed].flat()) next.set(made.id, made)
      return { commit: () => graphOf(...next.values()) }
    },
  }
  return graph as unknown as Graph
}

export function contextOf(graph: Graph, selected: string[]): OperationContext {
  return { graph, selected }
}

/** The tags of each entity after the operation's actions ran on the graph, by id */
export function tagsAfter(result: OperationResult, graph: Graph, ids: string[]) {
  let next = graph
  for (const action of result.actions) next = action(next)
  return Object.fromEntries(ids.map((id) => [id, next.entity(id).tags]))
}

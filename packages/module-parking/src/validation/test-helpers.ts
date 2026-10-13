// Test helpers for the parking rules and fixes: plain objects in the shape the rules read, and a graph
// with the methods a fix's actions use, so a test needs no real graph.
import type { Fix, RuleContext } from '@osm-editor-kit/maid-validation'
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

export function ruleContext(graph: Graph = graphOf()): RuleContext {
  return {
    graph,
    waysNear: () => [],
    validated: new Set(),
    memo: new Map(),
  } as unknown as RuleContext
}

/** The tags of an entity after a fix's actions ran on the graph */
export function tagsAfterFix(fix: Fix, graph: Graph, entityId: string) {
  let next = graph
  for (const action of fix.actions(graph)) next = action(next)
  return next.entity(entityId).tags
}

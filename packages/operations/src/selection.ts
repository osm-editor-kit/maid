// Helpers shared by the operations: the selected entities and the reason an action is blocked.
import type { Action, Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import type { OperationContext } from './types.ts'

/** The entities of the selection, in order. Undefined when there is no selection or an id is not in the graph. */
export function resolveSelection(context: OperationContext) {
  if (context.selected.length === 0) return undefined
  const entities: OsmEntity[] = []
  for (const id of context.selected) {
    const entity = context.graph.hasEntity(id)
    if (!entity) return undefined
    entities.push(entity)
  }
  return entities
}

/** Why an action cannot run on this graph, or undefined when it can */
export function reasonOf(action: Action, graph: Graph) {
  return action.disabled?.(graph) || undefined
}

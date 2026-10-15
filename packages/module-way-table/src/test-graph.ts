// Test helper: a graph of ways (and the nodes they need) for the way table's tests. Not part of the module's API.
import { Graph, ModelContext, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'

const context = new ModelContext()

export type TestWay = {
  readonly id: string
  readonly nodes: readonly string[]
  readonly tags?: Record<string, string>
}

/**
 * A graph with the ways and a node for each node id they name. Nodes without a location are placed on a line,
 * 0.001 degrees apart, in the order they first appear, unless `loc` gives them one. `omit` leaves nodes out (missing
 * nodes); the ways still name them.
 */
export function sceneOf(
  ways: readonly TestWay[],
  options: {
    readonly loc?: Record<string, [number, number]>
    readonly omit?: readonly string[]
  } = {},
): Graph {
  const omit = new Set(options.omit ?? [])
  const nodeIds: string[] = []
  for (const way of ways) for (const id of way.nodes) if (!nodeIds.includes(id)) nodeIds.push(id)

  const entities: OsmEntity[] = []
  nodeIds.forEach((id, index) => {
    if (omit.has(id)) return
    const loc = options.loc?.[id] ?? [13 + index * 0.001, 52]
    entities.push(new OsmNode(context, { id, loc, tags: {} }))
  })
  for (const way of ways) {
    entities.push(new OsmWay(context, { id: way.id, nodes: [...way.nodes], tags: { ...way.tags } }))
  }
  return new Graph(context, entities)
}

import { Graph, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { Operation, OperationContext } from '@osm-editor-kit/maid-operations'
// The outlines an operation would give the selected ways, drawn before it runs (the engine's previewOperation()),
// or the lines its own `preview` marks.
// Works on the copy of the graph the operation runs on: the staging graph is not changed.
import type { Feature } from 'geojson'
import type { OsmData } from './data'

export function operationPreview(
  operation: Operation,
  context: OperationContext,
  data: OsmData,
  selectedIds: string[],
): Feature[] {
  const features: Feature[] = []
  const { graph } = data.history.staging
  // an operation that asks for more input (`start`) shows only the lines of its own `preview` (the route a reroute
  // works on), as it has no outlines before it starts
  if (
    (!operation.start || operation.preview) &&
    operation.applies(context) &&
    !operation.disabled(context)
  ) {
    // the part the operation is about, marked as it is (state `preview-mark`), not the outlines after it
    if (operation.preview) {
      // a bare line is a mark; a helper line (style `helper`) is drawn dotted, for what is not there yet
      return operation.preview(context).map((item, i) => {
        const { line, style } = Array.isArray(item) ? { line: item, style: 'mark' } : item
        return {
          type: 'Feature',
          properties: { id: `preview-${style}-${i}`, state: `preview-${style}` },
          geometry: { type: 'LineString', coordinates: line },
        }
      })
    }
    let after: Graph | undefined
    try {
      after = operation.run(context).actions.reduce((g, action) => action(g), new Graph(graph))
    } catch {
      // an operation that cannot run has nothing to show
    }
    const ways = new Set<string>()
    for (const id of selectedIds) {
      switch (id.charAt(0)) {
        case 'w':
          ways.add(id)
          break
        case 'n':
          for (const w of data.nodeWays.get(id) ?? []) ways.add(w)
          break
      }
    }
    for (const wayId of after ? ways : []) {
      const before = graph.hasEntity(wayId)
      const way = after!.hasEntity(wayId)
      if (!(way instanceof OsmWay) || !(before instanceof OsmWay)) continue
      const locOf = (g: Graph, nodeId: string) => {
        const node = g.hasEntity(nodeId)
        return node instanceof OsmNode ? node.loc : undefined
      }
      const coordinates = way.nodes.map((nodeId) => locOf(after!, nodeId)).filter((loc) => !!loc)
      const moved =
        way.nodes.length !== before.nodes.length ||
        way.nodes.some((nodeId, i) => {
          const a = locOf(after!, nodeId)
          const b = locOf(graph, before.nodes[i]!)
          return !a || !b || a[0] !== b[0] || a[1] !== b[1]
        })
      if (!moved || coordinates.length < 2) continue
      features.push({
        type: 'Feature',
        properties: { id: `preview-${wayId}`, state: 'preview' },
        geometry: {
          type: 'LineString',
          coordinates: coordinates.map((loc) => [loc[0], loc[1]]),
        },
      })
    }
  }
  return features
}

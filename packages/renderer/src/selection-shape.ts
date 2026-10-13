// The shape points and direction arrows of the selected ways, for the highlight source (the engine's refreshShape()).
// Pure over the data and the selection: the caller keeps the result and sends it.
import type { Feature } from 'geojson'
import { wayVertices } from './build'
import type { OsmData } from './data'
import { onewayOf } from './direction'

/**
 * The shape points of the selection, in the small highlight source: all nodes of the selected
 * ways and, for a selected vertex, of the ways it belongs to, as iD shows them. They can be
 * picked and dragged like any vertex.
 */
export function selectionShape(data: OsmData, selectedIds: readonly string[]) {
  const ways = new Set<string>()
  for (const id of selectedIds) {
    switch (id.charAt(0)) {
      case 'w':
        ways.add(id)
        break
      case 'n':
        for (const wayId of data.nodeWays.get(id) ?? []) ways.add(wayId)
        break
    }
  }
  const shape = new Map<string, Feature>()
  // The direction of each selected open highway without arrows of its own: the way's line, drawn
  // with arrows (layers.ts highlight-direction). iD does not show a way's direction; this is Maid's.
  const directions: Feature[] = []
  for (const wayId of ways) {
    const vertices = wayVertices(data, wayId)
    for (const vertex of vertices) {
      const id = vertex.properties?.id
      if (typeof id !== 'string') continue
      vertex.properties = { id, state: 'shape' }
      shape.set(id, vertex)
    }
    const way = data.way(wayId)
    const closed = way !== undefined && way.nodes[0] === way.nodes[way.nodes.length - 1]
    if (way?.tags.highway && !closed && !onewayOf(way.tags) && vertices.length >= 2)
      directions.push({
        type: 'Feature',
        properties: { id: wayId, state: 'direction' },
        geometry: {
          type: 'LineString',
          coordinates: vertices.map((v) => v.geometry.coordinates),
        },
      })
  }
  return { nodes: new Set(shape.keys()), features: [...shape.values(), ...directions] }
}

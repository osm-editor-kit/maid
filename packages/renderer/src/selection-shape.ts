// The shape points of the selected ways, for the highlight source (the engine's refreshShape()).
// Pure over the data and the selection: the caller keeps the result and sends it.
import type { Feature } from 'geojson'
import { wayVertices } from './build'
import type { OsmData } from './data'

/**
 * The shape points of the selection, in the small highlight source: all nodes of the selected
 * ways and, for a selected vertex, of the ways it belongs to, as iD shows them. They can be
 * picked and dragged like any vertex.
 *
 * A selected node among them gets iD's selection shadow here (`halo`, layers.ts highlight-halo-shape) unless
 * `hasHalo` says the map draws one for it already: a vertex in the data's vertex source has its own (the corner of a
 * building does not, as untagged vertices are drawn only as shape points).
 */
export function selectionShape(
  data: OsmData,
  selectedIds: readonly string[],
  hasHalo: (id: string) => boolean = () => false,
) {
  const selected = new Set(selectedIds)
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
  for (const wayId of ways) {
    for (const vertex of wayVertices(data, wayId)) {
      const id = vertex.properties?.id
      if (typeof id !== 'string') continue
      vertex.properties =
        selected.has(id) && !hasHalo(id)
          ? { id, state: 'shape', halo: true }
          : { id, state: 'shape' }
      shape.set(id, vertex)
    }
  }
  return { nodes: new Set(shape.keys()), features: [...shape.values()] }
}

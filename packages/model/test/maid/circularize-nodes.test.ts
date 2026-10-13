// Maid's own test (not from Rapid or iD): how many nodes circularize adds to a small and a larger four-corner
// building. Before the change to iD's vertex rule (decided 2026-10-13), Rapid added 16 new nodes to both (21
// entries with the closing node). iD's rule gives the counts asserted below.
import { describe, expect, it } from 'bun:test'
import { geoMetersToLat, geoMetersToLon } from '@rapid-sdk/math'
import { Graph, ModelContext, OsmNode, OsmWay, actionCircularize } from '../../src/index.ts'

// A square building with the given side in metres, centred at lat 51, lon 13, corners a, b, c, d (in order).
function squareBuilding(side: number) {
  const context = new ModelContext()
  const lat0 = 51
  const lon0 = 13
  const half = side / 2
  const dLat = geoMetersToLat(half)
  const dLon = geoMetersToLon(half, lat0)
  const base = new Graph(context, [
    new OsmNode(context, { id: 'a', loc: [lon0 - dLon, lat0 - dLat] }),
    new OsmNode(context, { id: 'b', loc: [lon0 + dLon, lat0 - dLat] }),
    new OsmNode(context, { id: 'c', loc: [lon0 + dLon, lat0 + dLat] }),
    new OsmNode(context, { id: 'd', loc: [lon0 - dLon, lat0 + dLat] }),
    new OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
  ])
  return new Graph(base)
}

describe('actionCircularize node counts on a four-corner building', () => {
  it('adds 18 new nodes to a 20 m square: 22 nodes and the closing node', () => {
    const graph = squareBuilding(20)
    expect((graph.entity('-') as OsmWay).nodes).toHaveLength(5)

    const result = actionCircularize('-')(graph)
    const nodes = (result.entity('-') as OsmWay).nodes
    expect(nodes).toHaveLength(23)
    expect(new Set(nodes).size).toBe(22)
    for (const id of ['a', 'b', 'c', 'd']) expect(nodes).toContain(id)
  })

  it('adds 28 new nodes to an 80 m square: 32 nodes and the closing node', () => {
    const graph = squareBuilding(80)
    expect((graph.entity('-') as OsmWay).nodes).toHaveLength(5)

    const result = actionCircularize('-')(graph)
    const nodes = (result.entity('-') as OsmWay).nodes
    expect(nodes).toHaveLength(33)
    expect(new Set(nodes).size).toBe(32)
    for (const id of ['a', 'b', 'c', 'd']) expect(nodes).toContain(id)
  })
})

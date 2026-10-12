// Maid's own test (not from Rapid): way geometry is computed on first access, not when a Graph is rebased.
import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmWay } from '../../src/index.ts'
import type { OsmEntity } from '../../src/index.ts'
import { OsmRelation } from '../../src/index.ts'

// Private state under test. Only this file reads it, the rest of the suite uses the public API.
interface LazyInternals {
  _geoms: { orig: { extent: { min: number[]; max: number[] } } | null }
  _pendingGeomGraph: Graph | null | undefined
}
const internals = (entity: OsmEntity): LazyInternals => entity as unknown as LazyInternals

// Counts calls to asGeoJSON on one entity instance, so we can prove when geometry is computed.
function countGeoJSON(entity: OsmEntity): { calls: () => number } {
  let count = 0
  const target = entity as unknown as { asGeoJSON: (graph?: Graph) => unknown }
  const original = target.asGeoJSON.bind(entity)
  target.asGeoJSON = (graph?: Graph) => {
    count++
    return original(graph)
  }
  return { calls: () => count }
}

// Two nodes, one way over them, in a base graph that has been rebased.
// Expected extent by hand: min = (min lon, min lat) = (13.0, 52.0), max = (max lon, max lat) = (13.5, 52.25).
function setup() {
  const context = new ModelContext()
  const n1 = new OsmNode(context, { id: 'n1', loc: [13.0, 52.0] })
  const n2 = new OsmNode(context, { id: 'n2', loc: [13.5, 52.25] })
  const way = new OsmWay(context, { id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'residential' } })
  const base = new Graph(context)
  base.rebase([n1, n2, way])
  return { n1, n2, way, base }
}

describe('lazy geometry', () => {

  it('leaves a way pending after rebase, with no extent computed yet', () => {
    const { way, base } = setup()
    expect(internals(way)._pendingGeomGraph).toBe(base)
    expect(internals(way)._geoms).toBeUndefined()  // the container itself is created on first use
  })

  it('computes the same extent on first read of geoms', () => {
    const { way } = setup()
    expect(way.geoms.orig?.extent.min).toEqual([13.0, 52.0])
    expect(way.geoms.orig?.extent.max).toEqual([13.5, 52.25])
    expect(internals(way)._pendingGeomGraph).toBeUndefined()
  })

  it('computes the same extent from extent()', () => {
    const { way } = setup()
    expect(way.extent()?.min).toEqual([13.0, 52.0])
    expect(way.extent()?.max).toEqual([13.5, 52.25])
  })

  it('gives the way the new extent after a node moves in a new graph version', () => {
    const { n1, way, base } = setup()
    expect(way.extent()?.min).toEqual([13.0, 52.0])  // resolved once against the base graph

    // Move n1 to (13.2, 52.1). The new extent by hand: min (13.2, 52.1), max (13.5, 52.25).
    const head = new Graph(base)
    head.replace(n1.update({ loc: [13.2, 52.1] }))
    head.commit()

    expect(internals(way)._pendingGeomGraph).toBe(head)  // pending again, against the new version
    expect(way.extent()?.min).toEqual([13.2, 52.1])
    expect(way.extent()?.max).toEqual([13.5, 52.25])
  })

  it('keeps a copied way pending, without computing it', () => {
    const { way, base } = setup()
    const counter = countGeoJSON(way)

    const copy = way.update({ tags: { highway: 'service' } })
    expect(counter.calls()).toBe(0)
    expect(internals(copy)._pendingGeomGraph).toBe(base)
    expect(internals(copy)._geoms).toBeUndefined()  // the container itself is created on first use
    expect(internals(way)._pendingGeomGraph).toBe(base)  // the original is untouched

    expect(copy.extent()?.min).toEqual([13.0, 52.0])
    expect(copy.extent()?.max).toEqual([13.5, 52.25])
  })

  it('does not compute pending geometry on destroy', () => {
    const { way } = setup()
    const counter = countGeoJSON(way)
    way.destroy()
    expect(counter.calls()).toBe(0)
  })

  it('defers node geometry too, and computes it without a graph', () => {
    const context = new ModelContext()
    const node = new OsmNode(context, { id: 'n9', loc: [13.0, 52.0] })
    expect(internals(node)._pendingGeomGraph).toBeNull()
    expect(node.extent()?.min).toEqual([13.0, 52.0])
    expect(internals(node)._pendingGeomGraph).toBeUndefined()
  })

})

// Lazy containers: `_geoms` and the transients cache are created only when first used.
interface ContainerInternals {
  _geoms: unknown
  _transients: { map: Map<string, unknown> | null } | null
}
const containers = (entity: OsmEntity): ContainerInternals => entity as unknown as ContainerInternals

describe('lazy containers', () => {

  it('a fresh node, way and relation have no geometry container and no transients cache', () => {
    const context = new ModelContext()
    const node = new OsmNode(context, { id: 'n9', loc: [1, 2] })
    const way = new OsmWay(context, { id: 'w9', nodes: ['n9'] })
    const relation = new OsmRelation(context, { id: 'r9', members: [] })
    for (const entity of [node, way, relation]) {
      expect(containers(entity)._geoms).toBeUndefined()
      expect(containers(entity)._transients).toBeNull()
    }
  })

  it('copying an entity whose geometry was never created does not create one', () => {
    const context = new ModelContext()
    const node = new OsmNode(context, { id: 'n9', loc: [1, 2] })
    const copy = new OsmNode(node, { tags: { amenity: 'bench' } })
    expect(containers(node)._geoms).toBeUndefined()
    expect(containers(copy)._geoms).toBeUndefined()
  })

  it('a value memoised through a copy is visible through its source, and the other way round', () => {
    const context = new ModelContext()
    const node = new OsmNode(context, { id: 'n9', loc: [1, 2] })
    const copy = new OsmNode(node, { tags: { amenity: 'bench' } })
    let calls = 0

    expect(copy.transient('k', () => { calls++; return 'from copy' })).toBe('from copy')
    expect(node.transient('k', () => { calls++; return 'from source' })).toBe('from copy')
    expect(calls).toBe(1)

    expect(node.transient('j', () => 'from source')).toBe('from source')
    expect(copy.transient('j', () => 'recomputed')).toBe('from source')
  })

  it('clearing through a copy clears the source too, and clearing through the source clears the copy', () => {
    const context = new ModelContext()
    const node = new OsmNode(context, { id: 'n9', loc: [1, 2] })
    const copy = new OsmNode(node, { tags: { amenity: 'bench' } })
    let calls = 0
    const compute = () => { calls++; return calls }

    expect(node.transient('k', compute)).toBe(1)
    copy.updateGeometry()  // clears the shared cache
    expect(node.transient('k', compute)).toBe(2)
    expect(copy.transient('k', compute)).toBe(2)

    copy.transient('m', compute)
    node.updateGeometry()  // clears the shared cache from the other side
    expect(copy.transient('m', compute)).toBe(4)
    expect(calls).toBe(4)
  })
})

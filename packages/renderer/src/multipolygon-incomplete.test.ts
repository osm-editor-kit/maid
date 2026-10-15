// iD issue 1201: when only part of a multipolygon is loaded, iD closes the open outer ring with a
// straight line and fills the result, often on the wrong side. These tests show what Maid draws
// for complete and incomplete multipolygons: an open ring is never closed, so a partial multipolygon
// gets no fill until all its members are loaded.
import { describe, expect, it } from 'bun:test'
import { EditHistory, ModelContext, type OsmJsonElement } from '@osm-editor-kit/maid-model'
import type { Polygon } from 'geojson'
import { FeatureBuilder } from './build'
import { OsmData } from './data'

// A square of four corners, its outer ring split into two open ways (w10: 1-2-3, w11: 3-4-1).
// The inner triangle (w12) lies inside it.
const square: OsmJsonElement[] = [
  { type: 'node', id: 1, lat: 0, lon: 0 },
  { type: 'node', id: 2, lat: 1, lon: 0 },
  { type: 'node', id: 3, lat: 1, lon: 1 },
  { type: 'node', id: 4, lat: 0, lon: 1 },
  { type: 'node', id: 5, lat: 0.2, lon: 0.2 },
  { type: 'node', id: 6, lat: 0.2, lon: 0.4 },
  { type: 'node', id: 7, lat: 0.4, lon: 0.2 },
]
const outerA: OsmJsonElement = { type: 'way', id: 10, nodes: [1, 2, 3] }
const outerB: OsmJsonElement = { type: 'way', id: 11, nodes: [3, 4, 1] }
const inner: OsmJsonElement = { type: 'way', id: 12, nodes: [5, 6, 7, 5] }

function relation(members: { ref: number; role: string }[]): OsmJsonElement {
  return {
    type: 'relation',
    id: 20,
    tags: { type: 'multipolygon', landuse: 'grass' },
    members: members.map((m) => ({ type: 'way', ref: m.ref, role: m.role })),
  }
}

function newBuilder() {
  const context = new ModelContext()
  const data = new OsmData(context, new EditHistory(context))
  return { data, builder: new FeatureBuilder(data) }
}

describe('multipolygon fill with complete and incomplete members', () => {
  it('fills a complete multipolygon with its inner ring cut out', () => {
    const { data, builder } = newBuilder()
    const out = builder.build(
      data.merge([
        ...square,
        outerA,
        outerB,
        inner,
        relation([
          { ref: 10, role: 'outer' },
          { ref: 11, role: 'outer' },
          { ref: 12, role: 'inner' },
        ]),
      ]),
    )
    expect(out.areas.map((f) => f.id)).toEqual(['r20'])
    const geometry = out.areas[0]!.geometry as Polygon
    expect(geometry.type).toBe('Polygon')
    // one outer ring and one inner ring, each closed
    expect(geometry.coordinates).toHaveLength(2)
    for (const ring of geometry.coordinates) expect(ring[0]).toEqual(ring[ring.length - 1])
    // the outer ring is the square's four corners (lon, lat), plus the closing point
    const outer = geometry.coordinates[0]!
    expect(outer).toHaveLength(5)
    expect(new Set(outer.map((p) => p.join(',')))).toEqual(new Set(['0,0', '0,1', '1,1', '1,0']))
  })

  it('draws no fill while an outer way is missing, and no straight closing line either', () => {
    const { data, builder } = newBuilder()
    // w11 (3-4-1) is not loaded: the loaded part 1-2-3 is open, so it must not be closed
    const out = builder.build(
      data.merge([
        ...square,
        outerA,
        relation([
          { ref: 10, role: 'outer' },
          { ref: 11, role: 'outer' },
        ]),
      ]),
    )
    expect(out.areas).toEqual([])
    // the untagged outer way is not drawn as a line of its own either (build.ts buildWay)
    expect(out.lines).toEqual([])
  })

  it('fills the multipolygon once the missing outer way arrives', () => {
    const { data, builder } = newBuilder()
    const first = builder.build(
      data.merge([
        ...square,
        outerA,
        relation([
          { ref: 10, role: 'outer' },
          { ref: 11, role: 'outer' },
        ]),
      ]),
    )
    expect(first.areas).toEqual([])
    // the second load brings only the missing way: the waiting relation is drawn from its members
    const second = builder.build(data.merge([outerB]))
    expect(second.areas.map((f) => f.id)).toEqual(['r20'])
    const geometry = second.areas[0]!.geometry as Polygon
    expect(geometry.coordinates[0]).toHaveLength(5)
  })

  it('draws no fill while an outer way is missing, even when another outer ring is closed', () => {
    const { data, builder } = newBuilder()
    // a second, complete outer ring: a closed way of its own (w26, nodes 31-34)
    const otherRing: OsmJsonElement[] = [
      { type: 'node', id: 31, lat: 5, lon: 5 },
      { type: 'node', id: 32, lat: 5, lon: 6 },
      { type: 'node', id: 33, lat: 6, lon: 6 },
      { type: 'node', id: 34, lat: 6, lon: 5 },
      { type: 'way', id: 26, nodes: [31, 32, 33, 34, 31] },
    ]
    // w10 is open and w11 is missing: the relation waits, so the closed ring w26 is not filled either
    const out = builder.build(
      data.merge([
        ...square,
        ...otherRing,
        outerA,
        relation([
          { ref: 26, role: 'outer' },
          { ref: 10, role: 'outer' },
          { ref: 11, role: 'outer' },
        ]),
      ]),
    )
    expect(out.areas).toEqual([])
  })

  it('draws no fill while an inner ring is missing, and fills with the hole once it arrives', () => {
    const { data, builder } = newBuilder()
    // Maid waits for the whole relation (iD fills the outer ring here, without the hole; see the report)
    const out = builder.build(
      data.merge([
        ...square,
        outerA,
        outerB,
        relation([
          { ref: 10, role: 'outer' },
          { ref: 11, role: 'outer' },
          { ref: 12, role: 'inner' },
        ]),
      ]),
    )
    expect(out.areas).toEqual([])
    const later = builder.build(data.merge([inner]))
    expect(later.areas.map((f) => f.id)).toEqual(['r20'])
    const geometry = later.areas[0]!.geometry as Polygon
    expect(geometry.coordinates).toHaveLength(2)
  })
})

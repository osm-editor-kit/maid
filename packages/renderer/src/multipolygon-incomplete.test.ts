// iD issue 1201: when only part of a multipolygon is loaded, iD closes the open outer ring with a
// straight line and fills the result, often on the wrong side. Maid does neither: an open ring is never
// closed, so a partial multipolygon gets no fill until all its members are loaded. Its loaded untagged
// members are drawn as open lines in the area's own stroke (iD draws them as 'relation area' edges), and
// those lines leave the map when the multipolygon is complete and its area is drawn.
import { describe, expect, it } from 'bun:test'
import { EditHistory, ModelContext, type OsmJsonElement } from '@osm-editor-kit/maid-model'
import { resolveWayStyle, tagClasses } from '@osm-editor-kit/maid-style'
import type { LineString, Polygon } from 'geojson'
import { FeatureBuilder, type FeatureBatch, type SourceName } from './build'
import { OsmData } from './data'
import { redrawEntities } from './redraw'

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

/** The stroke an area's outline has (build.ts areaFeature): the line's stroke for a barrier, else the area's */
function outlineStroke(tags: Record<string, string>) {
  const classes = tagClasses(tags)
  const barrier = tags.barrier && tags.barrier !== 'no'
  return barrier ? resolveWayStyle(classes, 'line').stroke : resolveWayStyle(classes, 'area').stroke
}

/** The ids of features, sorted, so that a test does not depend on the order they were built in */
function sortedIds(features: { id?: string | number }[]) {
  return features.map((f) => String(f.id)).sort((a, b) => a.localeCompare(b))
}

/** The source each feature of a batch is drawn in, by id (what the engine keeps in featureSource) */
function sourcesOf(batch: FeatureBatch) {
  const sources = new Map<string, SourceName>()
  for (const name of ['areas', 'lines', 'points', 'vertices'] as const) {
    for (const f of batch[name]) sources.set(String(f.id), name)
  }
  return sources
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
    // the untagged members are part of the area: no outline of their own
    expect(out.lines).toEqual([])
  })

  it('draws the loaded part as an open outline, with no fill and no closing line, while an outer way is missing', () => {
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
    expect(out.lines.map((f) => f.id)).toEqual(['w10'])
    const line = out.lines[0]!
    expect(line.geometry.type).toBe('LineString')
    // the open part from node 1 via 2 to node 3, not closed
    expect((line.geometry as LineString).coordinates).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
    ])
    // the stroke of the area's outline, and no casing: an area has none
    const stroke = outlineStroke({ type: 'multipolygon', landuse: 'grass' })
    expect(line.properties?.sc).toBe(stroke.color)
    expect(line.properties?.sw).toBe(stroke.width)
    expect(line.properties?.cc).toBeUndefined()
  })

  it('draws the loaded outlines of an incomplete multipolygon, and a closed member stays a line too', () => {
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
    expect(sortedIds(out.lines)).toEqual(['w10', 'w26'])
  })

  it('fills the multipolygon once the missing outer way arrives, and the partial outline leaves the map', () => {
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
    expect(first.lines.map((f) => f.id)).toEqual(['w10'])
    expect(builder.takeRemoved()).toEqual([])
    // the second load brings only the missing way: the waiting relation is drawn from its members
    const second = builder.build(data.merge([outerB]))
    expect(second.areas.map((f) => f.id)).toEqual(['r20'])
    const geometry = second.areas[0]!.geometry as Polygon
    expect(geometry.coordinates[0]).toHaveLength(5)
    // the members are part of the area now: w10's outline is removed, and w11 gets no line
    expect(second.lines).toEqual([])
    expect(builder.takeRemoved()).toEqual([['lines', 'w10']])
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
    expect(out.lines.map((f) => f.id)).toEqual(['w10', 'w11'])
    const later = builder.build(data.merge([inner]))
    expect(later.areas.map((f) => f.id)).toEqual(['r20'])
    const geometry = later.areas[0]!.geometry as Polygon
    expect(geometry.coordinates).toHaveLength(2)
    expect(later.lines).toEqual([])
    expect(builder.takeRemoved().map(([, id]) => id)).toEqual(['w10', 'w11'])
  })
})

describe('outlines of an incomplete multipolygon', () => {
  it('keeps a tagged member in its own style, and draws only the untagged members as the outline', () => {
    const { data, builder } = newBuilder()
    const tagged: OsmJsonElement = {
      type: 'way',
      id: 10,
      nodes: [1, 2, 3],
      tags: { highway: 'primary' },
    }
    // the inner ring (w12) is missing: the relation waits
    const out = builder.build(
      data.merge([
        ...square,
        tagged,
        outerB,
        relation([
          { ref: 10, role: 'outer' },
          { ref: 11, role: 'outer' },
          { ref: 12, role: 'inner' },
        ]),
      ]),
    )
    expect(out.areas).toEqual([])
    expect(sortedIds(out.lines)).toEqual(['w10', 'w11'])
    const own = resolveWayStyle(tagClasses({ highway: 'primary' }), 'line')
    const ownLine = out.lines.find((f) => f.id === 'w10')!
    expect(ownLine.properties?.sc).toBe(own.stroke.color)
    expect(ownLine.properties?.cw).toBe(own.casing.width)
    // the untagged member is the outline: the area's stroke, without a casing
    const outline = out.lines.find((f) => f.id === 'w11')!
    const stroke = outlineStroke({ type: 'multipolygon', landuse: 'grass' })
    expect(outline.properties?.sc).toBe(stroke.color)
    expect(outline.properties?.cw).toBe(0)
  })

  it('styles the outline of an old-style multipolygon by the tags of its tagged outer way', () => {
    const { data, builder } = newBuilder()
    const outerTagged: OsmJsonElement = {
      type: 'way',
      id: 10,
      nodes: [1, 2, 3],
      tags: { landuse: 'forest' },
    }
    const old: OsmJsonElement = {
      type: 'relation',
      id: 20,
      tags: { type: 'multipolygon' },
      members: [
        { type: 'way', ref: 10, role: 'outer' },
        { type: 'way', ref: 11, role: 'outer' },
        { type: 'way', ref: 12, role: 'inner' },
      ],
    }
    // the inner ring is missing; w11 is untagged, so its outline takes the style of w10
    const out = builder.build(data.merge([...square, outerTagged, outerB, old]))
    expect(out.areas).toEqual([])
    expect(sortedIds(out.lines)).toEqual(['w10', 'w11'])
    const outline = out.lines.find((f) => f.id === 'w11')!
    // the area's width (1) differs from the line's (2): the outline is not drawn as the line
    const stroke = outlineStroke({ landuse: 'forest' })
    expect(outline.properties?.sc).toBe(stroke.color)
    expect(outline.properties?.sw).toBe(stroke.width)
    expect(outline.properties?.cc).toBeUndefined()
  })

  it('restyles the outline when the tagged outer way of an old-style multipolygon arrives later', () => {
    const { data, builder } = newBuilder()
    const old: OsmJsonElement = {
      type: 'relation',
      id: 20,
      tags: { type: 'multipolygon' },
      members: [
        { type: 'way', ref: 10, role: 'outer' },
        { type: 'way', ref: 11, role: 'outer' },
        { type: 'way', ref: 12, role: 'inner' },
      ],
    }
    // only the untagged w11 has arrived: nothing gives the outline a style yet
    const first = builder.build(data.merge([...square, outerB, old]))
    expect(sortedIds(first.lines)).toEqual(['w11'])
    // the tagged outer way comes: the outline of w11 takes its style, and w10 is drawn as itself
    const second = builder.build(
      data.merge([{ type: 'way', id: 10, nodes: [1, 2, 3], tags: { landuse: 'forest' } }]),
    )
    expect(second.areas).toEqual([])
    expect(sortedIds(second.lines)).toEqual(['w10', 'w11'])
    const outline = second.lines.find((f) => f.id === 'w11')!
    const stroke = outlineStroke({ landuse: 'forest' })
    expect(outline.properties?.sc).toBe(stroke.color)
    expect(outline.properties?.sw).toBe(stroke.width)
  })

  it('an edit that completes the multipolygon removes its outline and draws the area (redraw path)', () => {
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
    const sources = sourcesOf(first)
    expect(sources.get('w10')).toBe('lines')
    // the way comes into the graph without a build (an edit path), then the way is redrawn
    data.merge([outerB])
    const { batch, remove } = redrawEntities(data, builder, sources, [{ id: 'w11', moved: false }])
    expect(batch.areas.map((f) => f.id)).toEqual(['r20'])
    expect(batch.lines).toEqual([])
    expect(remove).toEqual([['lines', 'w10']])
  })
})

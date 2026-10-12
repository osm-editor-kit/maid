// Adopted from iD test/spec/svg/lines.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { EditHistory, ModelContext, type OsmJsonElement } from '@osm-editor-kit/maid-model'
import type { Feature } from 'geojson'
import { FeatureBuilder, type FeatureBatch } from './build'
import { OsmData } from './data'

// iD's coreGraph + surface, for Maid: merge the OSM JSON, then build the features of what was added.
function buildFeatures(elements: OsmJsonElement[]): FeatureBatch {
  const context = new ModelContext()
  const data = new OsmData(context, new EditHistory(context))
  return new FeatureBuilder(data).build(data.merge(elements))
}

/** The ids of line features in the order MapLibre draws them: by stacking band, then by sort key (layers.ts) */
function drawOrder(features: Feature[]) {
  const key = (f: Feature) => (f.properties ?? {}) as { b: number; z: number }
  return [...features].sort((x, y) => key(x).b - key(y).b || key(x).z - key(y).z).map((f) => f.id)
}

const node = (id: number, lon: number, lat: number): OsmJsonElement => ({
  type: 'node',
  id,
  lat,
  lon,
})

describe('iD.svgLines', () => {
  // n/a: iD's test checks the `way` and `line` DOM classes on the path.

  // n/a: iD's test checks the `relation` and `area` DOM classes on the stroke of an untagged member
  // of a multipolygon. Maid does not draw such a member as a line at all (build.ts buildWay); the
  // relation's area carries the outline (id-areas.test.ts, 'renders no strokes').

  // n/a: iD's test checks the `tag-highway` DOM classes; the style comes from the tags (style tests).

  // n/a: iD's test checks the `tag-natural-wood` DOM class on the stroke of a multipolygon member.
  // Maid's area feature takes the relation's own tags (build.ts areaFeature), no class names.

  describe('z-indexing', () => {
    const lo = [node(1, 0, 0), node(2, 1, 1)]
    const hi = [node(3, 0, 0), node(4, 1, 1)]
    const ways: OsmJsonElement[] = [
      { type: 'way', id: 1, nodes: [1, 2], tags: { highway: 'residential', layer: '0' } },
      { type: 'way', id: 2, nodes: [3, 4], tags: { highway: 'residential', layer: '1' } },
    ]
    const elements = [...lo, ...hi, ...ways]

    it('stacks higher lines above lower ones in a single render', () => {
      expect(drawOrder(buildFeatures(elements).lines)).toEqual(['w1', 'w2'])
    })

    it('stacks higher lines above lower ones in a single render (reverse)', () => {
      expect(
        drawOrder(buildFeatures([...ways.slice().reverse(), ...elements.slice(0, 4)]).lines),
      ).toEqual(['w1', 'w2'])
    })

    it('stacks higher lines above lower ones in separate renders', () => {
      const first = buildFeatures([...lo, ...ways.slice(0, 1)]).lines
      const second = buildFeatures([...hi, ...ways.slice(1)]).lines
      expect(drawOrder([...first, ...second])).toEqual(['w1', 'w2'])
    })

    it('stacks higher lines above lower in separate renders (reverse)', () => {
      const first = buildFeatures([...hi, ...ways.slice(1)]).lines
      const second = buildFeatures([...lo, ...ways.slice(0, 1)]).lines
      expect(drawOrder([...first, ...second])).toEqual(['w1', 'w2'])
    })
  })

  // n/a: iD puts a line into a DOM layer group named by its whole layer number (-2.5 goes to
  // layer-2). Maid keeps the fractional layer: a stacking band (-1, 0, 1) and a sort key.

  describe('oneway-markers', () => {
    it('has marker layer for oneway ways', () => {
      const lines = buildFeatures([
        node(1, 0, 0),
        node(2, 1e-2, 0),
        node(3, 0, 1e-2),
        { type: 'way', id: 1, nodes: [1, 2], tags: { waterway: 'stream' } },
        { type: 'way', id: 2, nodes: [1, 3], tags: { highway: 'residential', oneway: 'yes' } },
        { type: 'way', id: 3, nodes: [2, 3], tags: { highway: 'residential', oneway: '-1' } },
      ]).lines
      const oneway = Object.fromEntries(lines.map((f) => [f.id, f.properties?.oneway]))
      expect(oneway).toEqual({ w1: 1, w2: 1, w3: -1 })
    })

    it('has two marker layers for alternating oneway ways', () => {
      const lines = buildFeatures([
        node(1, 0, 0),
        node(2, 1e-2, 0),
        {
          type: 'way',
          id: 1,
          nodes: [1, 2],
          tags: { highway: 'residential', oneway: 'alternating' },
        },
      ]).lines
      // both ways: one marker per direction in iD, one feature with the both-ways kind in Maid
      expect(lines[0]?.properties?.oneway).toBe(2)
    })

    it('has no marker layer for oneway=no ways', () => {
      const lines = buildFeatures([
        node(1, 0, 0),
        node(2, 1e-2, 0),
        node(3, 0, 1e-2),
        { type: 'way', id: 1, nodes: [1, 2], tags: { highway: 'residential', oneway: 'no' } },
        { type: 'way', id: 2, nodes: [1, 3], tags: { highway: 'residential' } },
      ]).lines
      expect(lines.filter((f) => f.properties?.oneway !== undefined)).toEqual([])
    })
  })

  describe('sided-markers', () => {
    it('has marker layer for sided way', () => {
      const lines = buildFeatures([
        node(1, 0, 0),
        node(2, 1e-2, 0),
        node(3, 0, 1e-2),
        node(4, 1e-2, 1e-2),
        { type: 'way', id: 1, nodes: [1, 2], tags: { natural: 'cliff' } },
        { type: 'way', id: 2, nodes: [1, 3], tags: { natural: 'coastline' } },
        { type: 'way', id: 3, nodes: [1, 4], tags: { barrier: 'city_wall' } },
        { type: 'way', id: 4, nodes: [2, 3], tags: { man_made: 'quay' } },
      ]).lines
      const side = Object.fromEntries(lines.map((f) => [f.id, f.properties?.side]))
      expect(side).toEqual({
        w1: 'natural',
        w2: 'coastline',
        w3: 'barrier',
        w4: 'man_made',
      })
    })

    it('has no marker layer for two_sided way', () => {
      const lines = buildFeatures([
        node(1, 0, 0),
        node(2, 1e-2, 0),
        { type: 'way', id: 1, nodes: [1, 2], tags: { barrier: 'city_wall', two_sided: 'yes' } },
      ]).lines
      expect(lines[0]?.properties?.side).toBeUndefined()
    })
  })
})

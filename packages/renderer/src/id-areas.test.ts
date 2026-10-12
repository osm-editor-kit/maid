// Adopted from iD test/spec/svg/areas.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { EditHistory, ModelContext, type OsmJsonElement } from '@osm-editor-kit/maid-model'
import { FeatureBuilder } from './build'
import { OsmData } from './data'

// iD's coreGraph + surface, for Maid: merge the OSM JSON, then build the features of what was added.
function buildFeatures(elements: OsmJsonElement[]) {
  const context = new ModelContext()
  const data = new OsmData(context, new EditHistory(context))
  return new FeatureBuilder(data).build(data.merge(elements))
}

describe('iD.svgAreas', () => {
  // n/a: iD's test checks the `way` and `area` DOM classes on the path; Maid's features carry style
  // properties, not class names.

  // n/a: iD's test checks the `tag-building` DOM classes; the building style that those classes
  // select is resolved from the tags in build.ts and tested in packages/style/src/style.test.ts.

  // n/a: iD removes the DOM path of a deleted way and its vertex; Maid rebuilds features from the
  // history (engine.ts), and the builder has no DOM to check.

  describe('z-indexing', () => {
    // needs F-svg-1: smaller areas are stacked above larger ones. iD sorts areas by size; Maid's
    // areas layer has no fill-sort-key, so areas stack in the order they were built.
    it.todo('stacks smaller areas above larger ones in a single render', () => {})
    it.todo('stacks smaller areas above larger ones in a single render (reverse)', () => {})
    it.todo('stacks smaller areas above larger ones in separate renders', () => {})
    it.todo('stacks smaller areas above larger ones in separate renders (reverse)', () => {})
  })

  it('renders fills for multipolygon areas', () => {
    const areas = buildFeatures([
      { type: 'node', id: 1, lat: 1, lon: 1 },
      { type: 'node', id: 2, lat: 2, lon: 2 },
      { type: 'node', id: 3, lat: 3, lon: 3 },
      { type: 'way', id: 10, nodes: [1, 2, 3, 1] },
      {
        type: 'relation',
        id: 20,
        tags: { type: 'multipolygon' },
        members: [{ type: 'way', ref: 10, role: 'outer' }],
      },
    ]).areas
    // Maid's area feature for the relation is the one the area layer fills (iD's `.fill` path)
    expect(areas.map((feature) => feature.id)).toEqual(['r20'])
  })

  it('renders no strokes for multipolygon areas', () => {
    const lines = buildFeatures([
      { type: 'node', id: 1, lat: 1, lon: 1 },
      { type: 'node', id: 2, lat: 2, lon: 2 },
      { type: 'node', id: 3, lat: 3, lon: 3 },
      { type: 'way', id: 10, nodes: [1, 2, 3, 1] },
      {
        type: 'relation',
        id: 20,
        tags: { type: 'multipolygon' },
        members: [{ type: 'way', ref: 10, role: 'outer' }],
      },
    ]).lines
    // the untagged member way is not a line of its own: the relation's area is its outline
    expect(lines).toHaveLength(0)
  })
})

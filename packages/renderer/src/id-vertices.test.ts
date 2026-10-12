// Adopted from iD test/spec/svg/vertices.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { EditHistory, ModelContext } from '@osm-editor-kit/maid-model'
import { FeatureBuilder } from './build'
import { OsmData } from './data'

describe('iD.svgVertices', () => {
  it('adds the .shared class to vertices that are members of two or more ways', () => {
    const context = new ModelContext()
    const data = new OsmData(context, new EditHistory(context))
    const batch = new FeatureBuilder(data).build(
      data.merge([
        { type: 'node', id: 1, lat: 0, lon: 0 },
        { type: 'way', id: 1, nodes: [1], tags: { highway: 'residential' } },
        { type: 'way', id: 2, nodes: [1], tags: { highway: 'residential' } },
      ]),
    )
    // Maid's shared flag is the `s` property of a vertex feature
    const vertex = batch.vertices.find((feature) => feature.id === 'n1')
    expect(vertex?.properties).toMatchObject({ s: 1 })
  })
})

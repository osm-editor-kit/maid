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

  it('leaves out a corner that two buildings share (iD isConnected: only lines with tags connect)', () => {
    const context = new ModelContext()
    const data = new OsmData(context, new EditHistory(context))
    const nodes = [1, 2, 3, 4, 5, 6].map((id) => ({ type: 'node' as const, id, lat: id, lon: id }))
    const batch = new FeatureBuilder(data).build(
      data.merge([
        ...nodes,
        { type: 'way', id: 1, nodes: [1, 2, 3, 1], tags: { building: 'yes' } },
        { type: 'way', id: 2, nodes: [2, 3, 4, 2], tags: { building: 'yes' } },
        { type: 'way', id: 3, nodes: [5, 6], tags: { highway: 'footway' } },
      ]),
    )
    const ids = batch.vertices.map((feature) => feature.id)
    expect(ids).not.toContain('n2')
    expect(ids).not.toContain('n3')
    // the ends of a footway are drawn
    expect(ids).toContain('n5')
    expect(ids).toContain('n6')
  })
})

// The `lv` property of built features: the floors of an entity for layers.ts LEVEL_DIM (';-1;0;').
import { describe, expect, it } from 'bun:test'
import { EditHistory, ModelContext, type OsmJsonElement } from '@osm-editor-kit/maid-model'
import { FeatureBuilder } from './build'
import { OsmData } from './data'

function build(elements: OsmJsonElement[]) {
  const context = new ModelContext()
  const data = new OsmData(context, new EditHistory(context))
  return new FeatureBuilder(data).build(data.merge(elements))
}

const nodes: OsmJsonElement[] = [
  { type: 'node', id: 1, lat: 0, lon: 0 },
  { type: 'node', id: 2, lat: 0, lon: 1 },
  { type: 'node', id: 3, lat: 1, lon: 1 },
]

describe('lv: the floors of a built feature', () => {
  it('gives a way with level=-1;0 the floors -1 and 0', () => {
    const batch = build([
      ...nodes,
      { type: 'way', id: 1, nodes: [1, 2], tags: { highway: 'corridor', level: '-1;0' } },
    ])
    expect(batch.lines.find((f) => f.id === 'w1')?.properties).toMatchObject({ lv: ';-1;0;' })
  })

  it('gives no lv key to a way without levels', () => {
    const batch = build([
      ...nodes,
      { type: 'way', id: 1, nodes: [1, 2], tags: { highway: 'residential' } },
    ])
    expect(batch.lines.find((f) => f.id === 'w1')?.properties).not.toHaveProperty('lv')
  })

  it('takes repeat_on with level for a point', () => {
    const batch = build([
      { ...nodes[0]!, tags: { amenity: 'toilets', repeat_on: '1-2', level: '0' } },
    ])
    expect(batch.points.find((f) => f.id === 'n1')?.properties).toMatchObject({ lv: ';0;1;2;' })
  })

  it('gives an untagged vertex the floors of its way', () => {
    const batch = build([
      ...nodes,
      { type: 'way', id: 1, nodes: [1, 2, 3], tags: { highway: 'corridor', level: '1' } },
    ])
    expect(batch.vertices.find((f) => f.id === 'n1')?.properties).toMatchObject({ lv: ';1;' })
  })

  it('gives a vertex its own levels before those of its ways', () => {
    const batch = build([
      { ...nodes[0]!, tags: { level: '2' } },
      nodes[1]!,
      nodes[2]!,
      { type: 'way', id: 1, nodes: [1, 2, 3], tags: { highway: 'corridor', level: '1' } },
    ])
    expect(batch.vertices.find((f) => f.id === 'n1')?.properties).toMatchObject({ lv: ';2;' })
  })

  it('keeps a decimal level as String() writes it', () => {
    const batch = build([
      ...nodes,
      { type: 'way', id: 1, nodes: [1, 2], tags: { highway: 'corridor', level: '-1.7' } },
    ])
    expect(batch.lines.find((f) => f.id === 'w1')?.properties).toMatchObject({ lv: ';-1.7;' })
  })

  it('gives a closed area its floors, and no lv without them', () => {
    const batch = build([
      ...nodes,
      { type: 'way', id: 1, nodes: [1, 2, 3, 1], tags: { building: 'yes', level: '0;1' } },
      { type: 'way', id: 2, nodes: [1, 2, 3, 1], tags: { building: 'yes' } },
    ])
    const areas = batch.areas
    expect(areas.find((f) => f.id === 'w1')?.properties).toMatchObject({ lv: ';0;1;' })
    expect(areas.find((f) => f.id === 'w2')?.properties).not.toHaveProperty('lv')
  })

  it('gives a multipolygon the floors of its relation', () => {
    const batch = build([
      ...nodes,
      { type: 'way', id: 1, nodes: [1, 2, 3, 1], tags: { building: 'yes' } },
      {
        type: 'relation',
        id: 5,
        tags: { type: 'multipolygon', building: 'yes', level: '3' },
        members: [{ type: 'way', ref: 1, role: 'outer' }],
      },
    ])
    expect(batch.areas.find((f) => f.id === 'r5')?.properties).toMatchObject({ lv: ';3;' })
  })
})

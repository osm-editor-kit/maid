// The shape points of the selection and the shadow of its selected nodes (layers.ts highlight-halo-shape)
import { describe, expect, it } from 'bun:test'
import { EditHistory, ModelContext, type OsmJsonElement } from '@osm-editor-kit/maid-model'
import { OsmData } from './data'
import { selectionShape } from './selection-shape'

function dataOf(elements: OsmJsonElement[]) {
  const context = new ModelContext()
  const data = new OsmData(context, new EditHistory(context))
  data.merge(elements)
  return data
}

// a house of four corners, none tagged
const house = dataOf([
  { type: 'node', id: 1, lat: 0, lon: 0 },
  { type: 'node', id: 2, lat: 0, lon: 0.001 },
  { type: 'node', id: 3, lat: 0.001, lon: 0.001 },
  { type: 'node', id: 4, lat: 0.001, lon: 0 },
  { type: 'way', id: 1, nodes: [1, 2, 3, 4, 1], tags: { building: 'house' } },
])

const props = (features: ReturnType<typeof selectionShape>['features']) =>
  Object.fromEntries(features.map((f) => [f.properties?.id, f.properties]))

describe('selectionShape: the shadow of the selected nodes', () => {
  it('marks two selected corners of a house, and not the other two', () => {
    const shape = props(selectionShape(house, ['n1', 'n2']).features)
    expect(shape.n1).toEqual({ id: 'n1', state: 'shape', halo: true })
    expect(shape.n2).toEqual({ id: 'n2', state: 'shape', halo: true })
    expect(shape.n3).toEqual({ id: 'n3', state: 'shape' })
    expect(shape.n4).toEqual({ id: 'n4', state: 'shape' })
  })

  it('leaves a node to its own shadow when the map draws one for it (a vertex of the data)', () => {
    const shape = props(selectionShape(house, ['n1', 'n2'], (id) => id === 'n1').features)
    expect(shape.n1).toEqual({ id: 'n1', state: 'shape' })
    expect(shape.n2).toEqual({ id: 'n2', state: 'shape', halo: true })
  })

  it('marks no corner when the house itself is selected', () => {
    const shape = props(selectionShape(house, ['w1']).features)
    expect(JSON.stringify(shape)).not.toContain('halo')
    expect(Object.keys(shape)).toHaveLength(4)
  })
})

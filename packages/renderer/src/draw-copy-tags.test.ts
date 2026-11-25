import { describe, expect, it } from 'bun:test'
import { ModelContext, OsmWay } from '@osm-editor-kit/maid-model'
import { sourceWayOf } from './draw'

const context = new ModelContext()
const road = new OsmWay(context, {
  id: 'w1',
  nodes: ['n1', 'n2', 'n3'],
  tags: { highway: 'residential', surface: 'asphalt' },
})
const building = new OsmWay(context, {
  id: 'w2',
  nodes: ['n2', 'n4', 'n5', 'n2'],
  tags: { building: 'yes', area: 'yes' },
})
const ways = new Map([road, building].map((way) => [way.id, way]))
const wayOf = (id: string) => ways.get(id)

describe('sourceWayOf', () => {
  it('takes the selected way that has the node', () => {
    expect(sourceWayOf('n2', ['w1'], [], wayOf)?.id).toBe('w1')
  })
  it('takes the way selected before, when now one of its nodes is selected', () => {
    expect(sourceWayOf('n2', ['n2'], ['w1'], wayOf)?.id).toBe('w1')
  })
  it('takes nothing without a selected way, from another way, or from an area', () => {
    expect(sourceWayOf('n2', [], ['w1'], wayOf)).toBeUndefined()
    expect(sourceWayOf('n4', ['w1'], [], wayOf)).toBeUndefined()
    expect(sourceWayOf('n4', ['n4'], ['w1'], wayOf)).toBeUndefined()
    expect(sourceWayOf('n2', ['w2'], [], wayOf)).toBeUndefined()
  })
})

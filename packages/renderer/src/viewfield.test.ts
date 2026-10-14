// The directions of a node become its cones (d0, d1 on the vertex or point feature). The cases follow Rapid's
// OsmNode.test.js (directions: numeric, cardinal, nonsense, forward and backward), which is iD's spec as well.
import { describe, expect, test } from 'bun:test'
import { EditHistory, type OsmJsonElement, ModelContext } from '@osm-editor-kit/maid-model'
import { FeatureBuilder } from './build'
import { OsmData } from './data'
import { hasDirectionTags } from './viewfield'

function build(elements: OsmJsonElement[]) {
  const context = new ModelContext()
  const data = new OsmData(context, new EditHistory(context))
  const batch = new FeatureBuilder(data).build(data.merge(elements))
  return { batch }
}

/** The properties of the point feature of node 1, which is a standalone node with the given tags */
function pointProps(tags: Record<string, string>) {
  const { batch } = build([{ type: 'node', id: 1, lat: 0, lon: 0, tags }])
  return batch.points.find((f) => f.id === 'n1')?.properties ?? {}
}

describe('the cones of a standalone point', () => {
  test('a numeric direction gives one cone at that bearing', () => {
    expect(pointProps({ highway: 'traffic_signals', direction: '45' })).toMatchObject({ d0: 45 })
    expect(pointProps({ highway: 'traffic_signals', direction: '45' })).not.toHaveProperty('d1')
  });

  test('numeric values are kept as they are, as Rapid does (-45, 360, 1000)', () => {
    expect(pointProps({ highway: 'traffic_signals', direction: '-45' })).toMatchObject({ d0: -45 })
    expect(pointProps({ highway: 'traffic_signals', direction: '360' })).toMatchObject({ d0: 360 })
    expect(pointProps({ highway: 'traffic_signals', direction: '1000' })).toMatchObject({ d0: 1000 })
  });

  // Rapid's table: every cardinal, full name, short name, upper and mixed case
  const CARDINALS: [string, number][] = [
    ['n', 0], ['north', 0], ['N', 0], ['NOrth', 0],
    ['nne', 22], ['northnortheast', 22], ['NnE', 22],
    ['ne', 45], ['northeast', 45], ['nE', 45],
    ['ene', 67], ['eastnortheast', 67], ['EnE', 67],
    ['e', 90], ['east', 90], ['EAst', 90],
    ['ese', 112], ['eastsoutheast', 112], ['EsE', 112],
    ['se', 135], ['southeast', 135], ['sE', 135],
    ['sse', 157], ['southsoutheast', 157], ['SsE', 157],
    ['s', 180], ['south', 180], ['SOuth', 180],
    ['ssw', 202], ['southsouthwest', 202], ['SsW', 202],
    ['sw', 225], ['southwest', 225], ['sW', 225],
    ['wsw', 247], ['westsouthwest', 247], ['WsW', 247],
    ['w', 270], ['west', 270], ['WEst', 270],
    ['wnw', 292], ['westnorthwest', 292], ['WnW', 292],
    ['nw', 315], ['northwest', 315], ['nW', 315],
    ['nnw', 337], ['northnorthwest', 337], ['NnW', 337],
  ]
  for (const [value, bearing] of CARDINALS) {
    test(`the cardinal "${value}" is ${bearing} degrees`, () => {
      expect(pointProps({ highway: 'traffic_signals', direction: value })).toMatchObject({
        d0: bearing,
      })
    })
  }

  test('a list gives one cone per value, the first two at most', () => {
    expect(pointProps({ highway: 'traffic_signals', direction: '0;90' })).toMatchObject({
      d0: 0,
      d1: 90,
    })
  });

  test('a suffix key such as camera:direction is the direction', () => {
    expect(pointProps({ man_made: 'surveillance', 'camera:direction': '180' })).toMatchObject({
      d0: 180,
    })
    expect(
      pointProps({ man_made: 'surveillance', direction: '90', 'camera:direction': '180' }),
    ).toMatchObject({ d0: 180 })
  });

  test('nothing for a node without a direction, or with a value that is not one', () => {
    expect(pointProps({ highway: 'traffic_signals' })).not.toHaveProperty('d0')
    expect(pointProps({ highway: 'traffic_signals', direction: '' })).not.toHaveProperty('d0')
    expect(pointProps({ highway: 'traffic_signals', direction: 'eastwest' })).not.toHaveProperty(
      'd0',
    )
    expect(pointProps({ highway: 'traffic_signals', direction: 'NaN' })).not.toHaveProperty('d0')
  });
})

describe('the cones of a vertex of a way', () => {
  // A way of three nodes running north: node 2 is south of node 3, node 4 north of it
  const way: OsmJsonElement[] = [
    { type: 'node', id: 2, lat: 0, lon: 0 },
    { type: 'node', id: 3, lat: 0.001, lon: 0, tags: { highway: 'traffic_signals' } },
    { type: 'node', id: 4, lat: 0.002, lon: 0 },
    { type: 'way', id: 1, nodes: [2, 3, 4], tags: { highway: 'residential' } },
  ]

  test('direction=forward points back to the previous node, as iD does', () => {
    const { batch } = build([
      way[0]!,
      { ...way[1]!, tags: { highway: 'traffic_signals', direction: 'forward' } } as OsmJsonElement,
      way[2]!,
      way[3]!,
    ])
    const vertex = batch.vertices.find((f) => f.id === 'n3')
    // the previous node (2) lies south of node 3: a bearing of 180
    expect(vertex?.properties?.d0).toBeCloseTo(180, 6)
  })

  test('direction=backward points to the next node', () => {
    const { batch } = build([
      way[0]!,
      { ...way[1]!, tags: { highway: 'traffic_signals', direction: 'backward' } } as OsmJsonElement,
      way[2]!,
      way[3]!,
    ])
    const vertex = batch.vertices.find((f) => f.id === 'n3')
    // the next node (4) lies north of node 3: a bearing of 0
    expect(vertex?.properties?.d0).toBeCloseTo(0, 6)
  })

  test('a vertex without a direction has no cone', () => {
    const { batch } = build([
      way[0]!,
      { ...way[1]!, tags: { highway: 'traffic_signals' } } as OsmJsonElement,
      way[2]!,
      way[3]!,
    ])
    expect(batch.vertices.find((f) => f.id === 'n3')?.properties).not.toHaveProperty('d0')
  })
})

describe('hasDirectionTags (the test before directions() runs)', () => {
  test('is true for the tags directions() reads and false for the rest', () => {
    expect(hasDirectionTags({ direction: '0' })).toBe(true)
    expect(hasDirectionTags({ stop: 'all' })).toBe(true)
    expect(hasDirectionTags({ 'traffic_signals:direction': 'forward' })).toBe(true)
    expect(hasDirectionTags({ highway: 'stop', name: 'Stop' })).toBe(false)
    expect(hasDirectionTags({})).toBe(false)
  })
})

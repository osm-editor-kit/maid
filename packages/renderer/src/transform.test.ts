import { describe, expect, test } from 'bun:test'
import { actionMove, Graph, ModelContext, OsmNode } from '@osm-editor-kit/maid-model'
import { toMercator, worldDelta } from './transform'

describe('worldDelta', () => {
  test('actionMove moves a node by it onto the pointer, north and east', () => {
    const context = new ModelContext()
    const from: [number, number] = [13.4, 52.5]
    const to: [number, number] = [13.41, 52.52]
    const graph = new Graph(context, [new OsmNode(context, { id: 'n1', loc: from })])

    const result = actionMove(
      ['n1'],
      worldDelta(toMercator(from), toMercator(to)),
    )(new Graph(graph))
    const loc = (result.entity('n1') as OsmNode).loc as [number, number]

    expect(loc[0]).toBeCloseTo(to[0], 9)
    expect(loc[1]).toBeCloseTo(to[1], 9)
  })

  test('south and west, and no move for the same point', () => {
    const context = new ModelContext()
    const from: [number, number] = [-0.12, 51.5]
    const to: [number, number] = [-0.13, 51.49]
    const graph = new Graph(context, [new OsmNode(context, { id: 'n1', loc: from })])

    const moved = actionMove(['n1'], worldDelta(toMercator(from), toMercator(to)))(new Graph(graph))
    const loc = (moved.entity('n1') as OsmNode).loc as [number, number]
    expect(loc[0]).toBeCloseTo(to[0], 9)
    expect(loc[1]).toBeCloseTo(to[1], 9)

    const none = worldDelta(toMercator(from), toMercator(from))
    expect(none[0]).toBeCloseTo(0, 12)
    expect(none[1]).toBeCloseTo(0, 12)
  })
})

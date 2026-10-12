// Maid's own tests (not from Rapid): moving a way must not add a vertex to the moved way when the way is
// straight. A way that is straight before and after the move keeps its nodes. The unmoved way that
// shares the junction gets the shape-preserving vertex only when it was bent there, as iD does.
import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmWay, actionMove } from '../../src/index.ts'

describe('actionMove and a straight moved way', () => {
  const context = new ModelContext()
  const delta: [number, number] = [400, 250]

  // w1 is straight along the equator: a, b, c. The second way passes through or starts at its middle node b.
  const nodes = () => [
    new OsmNode(context, { id: 'a', loc: [0, 0] }),
    new OsmNode(context, { id: 'b', loc: [0.0001, 0] }),
    new OsmNode(context, { id: 'c', loc: [0.0002, 0] }),
    new OsmNode(context, { id: 'd', loc: [0.0001, 0.0001] }),
    new OsmNode(context, { id: 'e', loc: [0.0001, -0.0001] }),
  ]
  const w1 = () => new OsmWay(context, { id: 'w1', nodes: ['a', 'b', 'c'] })

  it('a straight way with a second way starting at its middle node keeps its three nodes', () => {
    const base = new Graph(context, [...nodes(), w1(), new OsmWay(context, { id: 'w2', nodes: ['b', 'd'] })])
    const result = actionMove(['w1'], delta)(new Graph(base))

    expect((result.entity('w1') as OsmWay).nodes).toEqual(['a', 'b', 'c'])
    expect((result.entity('w2') as OsmWay).nodes).toEqual(['b', 'd'])
  })

  it('a straight way that another way crosses at its middle node keeps its three nodes', () => {
    // w2 goes through b: both ways continue past the junction, so the junction is not an endpoint of either
    const base = new Graph(context, [...nodes(), w1(), new OsmWay(context, { id: 'w2', nodes: ['d', 'b', 'e'] })])
    const result = actionMove(['w1'], delta)(new Graph(base))

    expect((result.entity('w1') as OsmWay).nodes).toEqual(['a', 'b', 'c'])
    expect((result.entity('w2') as OsmWay).nodes).toEqual(['d', 'b', 'e'])
  })

  it('the bent unmoved way gets one vertex at the junction\'s old place, the moved straight way none', () => {
    // w2 bends at b, so the replacement vertex on w2 is not skipped (it would not be a straight line)
    const base = new Graph(context, [
      new OsmNode(context, { id: 'a', loc: [0, 0] }),
      new OsmNode(context, { id: 'b', loc: [0.0001, 0] }),
      new OsmNode(context, { id: 'c', loc: [0.0002, 0] }),
      new OsmNode(context, { id: 'd', loc: [0.0001, 0.0001] }),
      new OsmNode(context, { id: 'e', loc: [0.0002, 0.0002] }),
      w1(),
      new OsmWay(context, { id: 'w2', nodes: ['d', 'b', 'e'] }),
    ])
    const result = actionMove(['w1'], delta)(new Graph(base))

    expect((result.entity('w1') as OsmWay).nodes).toEqual(['a', 'b', 'c'])
    const w2 = (result.entity('w2') as OsmWay).nodes
    expect(w2.length).toBe(4)
    expect(w2[0]).toBe('d')
    expect(w2[3]).toBe('e')
    // the new vertex sits where b was before the move
    const kept = w2[1] === 'b' ? w2[2] : w2[1]
    const at = (result.entity(kept) as OsmNode).loc as [number, number]
    expect(at[0]).toBeCloseTo(0.0001, 9)
    expect(at[1]).toBeCloseTo(0, 9)
  })
})

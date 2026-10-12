// Turn restrictions: the from, via and to members after a split of one of their ways.
// Adopted in spirit from iD's actions/split.js restriction titles and relation.js (ISC, © iD contributors).
import { describe, expect, it } from 'bun:test'
import * as Rapid from '../../rapid.ts'

const context = new Rapid.MockContext()

const pt = (id: string, x: number, y = 0) => new Rapid.OsmNode(context, { id, loc: [x, y] })
const way = (id: string, nodes: string[]) => new Rapid.OsmWay(context, { id, nodes })

/** The way's nodes for the member with the role, as a node string. */
function nodesOf(graph: Rapid.Graph, relationID: string, role: string): string[] {
  return (graph.entity(relationID) as Rapid.OsmRelation)
    .membersByRole(role)
    .map((m) => (graph.entity(m.id) as Rapid.OsmWay).nodes.join(''))
}

describe('turn restriction members after a split', () => {
  it('keeps the from member on the part of the way that touches the via node', () => {
    // from F = a-m-b, via node b, to T = b-c. Split F at m: from must be the part m-b, the one at b.
    const base = new Rapid.Graph(context, [
      pt('a', 0), pt('m', 0.5), pt('b', 1), pt('c', 2),
      way('F', ['a', 'm', 'b']),
      way('T', ['b', 'c']),
      new Rapid.OsmRelation(context, {
        id: 'r',
        tags: { type: 'restriction', restriction: 'no_left_turn' },
        members: [
          { id: 'F', type: 'way', role: 'from' },
          { id: 'b', type: 'node', role: 'via' },
          { id: 'T', type: 'way', role: 'to' },
        ],
      }),
    ])
    const graph = Rapid.actionSplit('m', ['=(new)'])(new Rapid.Graph(base))
    expect(nodesOf(graph, 'r', 'from')).toEqual(['mb'])
    expect(nodesOf(graph, 'r', 'to')).toEqual(['bc'])
  })

  it('keeps the to member on the part of the way that touches the via way', () => {
    // to T = b-m-c, via way V = p-b. Split T at m: to must stay on the part b-m that touches V.
    const base = new Rapid.Graph(context, [
      pt('a', 0), pt('p', 0.5, 1), pt('b', 1), pt('m', 1.5), pt('c', 2),
      way('F', ['a', 'b']),
      way('V', ['p', 'b']),
      way('T', ['b', 'm', 'c']),
      new Rapid.OsmRelation(context, {
        id: 'r',
        tags: { type: 'restriction', restriction: 'no_u_turn' },
        members: [
          { id: 'F', type: 'way', role: 'from' },
          { id: 'V', type: 'way', role: 'via' },
          { id: 'T', type: 'way', role: 'to' },
        ],
      }),
    ])
    const graph = Rapid.actionSplit('m', ['=(new)'])(new Rapid.Graph(base))
    expect(nodesOf(graph, 'r', 'to')).toEqual(['bm'])
  })

  it('puts both parts of a split via way in the via role', () => {
    // via V = b-m-c between from F = a-b and to T = c-d. The order of via ways is not semantic, so only the set is checked.
    const base = new Rapid.Graph(context, [
      pt('a', 0), pt('b', 1), pt('m', 1.5), pt('c', 2), pt('d', 3),
      way('F', ['a', 'b']),
      way('V', ['b', 'm', 'c']),
      way('T', ['c', 'd']),
      new Rapid.OsmRelation(context, {
        id: 'r',
        tags: { type: 'restriction', restriction: 'only_straight_on' },
        members: [
          { id: 'F', type: 'way', role: 'from' },
          { id: 'V', type: 'way', role: 'via' },
          { id: 'T', type: 'way', role: 'to' },
        ],
      }),
    ])
    const graph = Rapid.actionSplit('m', ['=(new)'])(new Rapid.Graph(base))
    expect(nodesOf(graph, 'r', 'via').sort()).toEqual(['bm', 'mc'])
    expect(nodesOf(graph, 'r', 'from')).toEqual(['ab'])
    expect(nodesOf(graph, 'r', 'to')).toEqual(['cd'])
  })

  it('counts the intersection role of a destination_sign relation as via', () => {
    // as the test above, for a destination sign: the way V has the `intersection` role, so its split part keeps that role
    const base = new Rapid.Graph(context, [
      pt('a', 0), pt('b', 1), pt('m', 1.5), pt('c', 2), pt('d', 3),
      way('F', ['a', 'b']),
      way('V', ['b', 'm', 'c']),
      way('T', ['c', 'd']),
      new Rapid.OsmRelation(context, {
        id: 'r',
        tags: { type: 'destination_sign' },
        members: [
          { id: 'F', type: 'way', role: 'from' },
          { id: 'V', type: 'way', role: 'intersection' },
          { id: 'T', type: 'way', role: 'to' },
        ],
      }),
    ])
    const graph = Rapid.actionSplit('m', ['=(new)'])(new Rapid.Graph(base))
    expect(nodesOf(graph, 'r', 'intersection').sort()).toEqual(['bm', 'mc'])
    expect(nodesOf(graph, 'r', 'from')).toEqual(['ab'])
    expect(nodesOf(graph, 'r', 'to')).toEqual(['cd'])
  })
})

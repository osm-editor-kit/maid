import { describe, expect, it } from 'bun:test'
import { Graph, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import { graphOf, node, way } from '../cut/test-graph.ts'
import { toMetres } from '../shared/metres.ts'
import type { Pt } from '../shared/vector.ts'
import {
  extrude,
  extrudeAction,
  extrudeApplies,
  extrudeWayOf,
  sidesOf,
  snapDistance,
  snapTargets,
  type ExtrudeWay,
  type Side,
} from './extrude.ts'

/** A building 40 m by 20 m, anticlockwise: n1 (0,0), n2 (40,0), n3 (40,20), n4 (0,20) */
function rectangle(order: string[] = ['n1', 'n2', 'n3', 'n4', 'n1']) {
  return graphOf(
    node('n1', 0, 0),
    node('n2', 40, 0),
    node('n3', 40, 20),
    node('n4', 0, 20),
    way('w1', order, { building: 'yes' }),
  )
}

function wayOf(graph: Graph, id = 'w1'): ExtrudeWay {
  const result = extrudeWayOf(graph, id)
  if ('refused' in result) throw new Error(result.refused)
  return result
}

function sideOf(w: ExtrudeWay, a: string, b: string): Side {
  const side = sidesOf(w).find((s) => s.a === a && s.b === b)
  if (!side) throw new Error(`no side ${a}-${b}`)
  return side
}

/** A place relative to a node of the way, so the frame's origin does not matter */
function rel(w: ExtrudeWay, p: Pt, origin = 'n1'): Pt {
  const o = w.points.get(origin)!
  return { x: Math.round((p.x - o.x) * 1000) / 1000, y: Math.round((p.y - o.y) * 1000) / 1000 }
}

describe('extrudeApplies', () => {
  it('applies to one way only', () => {
    const graph = rectangle()
    expect(extrudeApplies(graph, ['w1'])).toBe(true)
    expect(extrudeApplies(graph, ['n1'])).toBe(false)
    expect(extrudeApplies(graph, ['w1', 'n1'])).toBe(false)
    expect(extrudeApplies(graph, ['w9'])).toBe(false)
  })

  it('refuses a way with a node that is not loaded', () => {
    const graph = graphOf(node('n1', 0, 0), way('w1', ['n1', 'n2']))
    expect(extrudeWayOf(graph, 'w1')).toEqual({ refused: 'incomplete' })
  })
})

describe('sidesOf', () => {
  it('has the normal pointing out of a ring, whichever way it runs', () => {
    for (const order of [
      ['n1', 'n2', 'n3', 'n4', 'n1'],
      ['n1', 'n4', 'n3', 'n2', 'n1'],
    ]) {
      const w = wayOf(rectangle(order))
      const bottom = sidesOf(w).find((s) => [s.a, s.b].sort().join() === 'n1,n2')!
      expect(bottom.normal.x).toBeCloseTo(0, 9)
      expect(bottom.normal.y).toBeCloseTo(-1, 9)
    }
  })

  it('knows the neighbours across the closing node of a ring', () => {
    const w = wayOf(rectangle())
    expect(sideOf(w, 'n1', 'n2')).toMatchObject({ before: 'n4', after: 'n3' })
    expect(sideOf(w, 'n4', 'n1')).toMatchObject({ before: 'n3', after: 'n2' })
  })

  it('has no neighbour at the ends of a line', () => {
    const graph = graphOf(node('n1', 0, 0), node('n2', 10, 0), way('w1', ['n1', 'n2']))
    const [side] = sidesOf(wayOf(graph))
    expect(side!.before).toBeUndefined()
    expect(side!.after).toBeUndefined()
  })
})

describe('extrude, new corners', () => {
  it('makes a rectangle longer when a side is pulled: no new node', () => {
    const w = wayOf(rectangle())
    const result = extrude(w, sideOf(w, 'n2', 'n3'), 5, 'corners')
    expect(result.nodes).toEqual(['n1', 'n2', 'n3', 'n4', 'n1'])
    expect(rel(w, result.moved.get('n2')!)).toEqual({ x: 45, y: 0 })
    expect(rel(w, result.moved.get('n3')!)).toEqual({ x: 45, y: 20 })
  })

  it('makes a notch the other way', () => {
    const w = wayOf(rectangle())
    const result = extrude(w, sideOf(w, 'n2', 'n3'), -10, 'corners')
    expect(rel(w, result.moved.get('n2')!)).toEqual({ x: 30, y: 0 })
  })

  it('makes a bump with two new corners from a part of a straight wall', () => {
    // n1 (0,0), a (10,0), b (20,0), n2 (40,0), ...: the part a-b is pulled out 5 m to the south
    const graph = graphOf(
      node('n1', 0, 0),
      node('a', 10, 0),
      node('b', 20, 0),
      node('n2', 40, 0),
      node('n3', 40, 20),
      node('n4', 0, 20),
      way('w1', ['n1', 'a', 'b', 'n2', 'n3', 'n4', 'n1'], { building: 'yes' }),
    )
    const w = wayOf(graph)
    const result = extrude(w, sideOf(w, 'a', 'b'), 5, 'corners')
    expect(result.moved.size).toBe(0)
    expect(result.nodes.length).toBe(9)
    expect(result.nodes.slice(0, 2)).toEqual(['n1', 'a'])
    expect(rel(w, result.nodes[2] as Pt)).toEqual({ x: 10, y: -5 })
    expect(rel(w, result.nodes[3] as Pt)).toEqual({ x: 20, y: -5 })
    expect(result.nodes.slice(4)).toEqual(['b', 'n2', 'n3', 'n4', 'n1'])
  })

  it('pulls the closing side of a ring: the new corners go before the closing node', () => {
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 40, 0),
      node('n3', 40, 20),
      node('n4', 0, 20),
      node('n5', 20, 30),
      way('w1', ['n1', 'n2', 'n3', 'n5', 'n4', 'n1'], { building: 'yes' }),
    )
    const w = wayOf(graph)
    // n4-n1 has n5 (slanted) before it and n2 (at a right angle) after it: n4 gets a new corner, n1 moves
    const result = extrude(w, sideOf(w, 'n4', 'n1'), 5, 'corners')
    expect(result.nodes.length).toBe(7)
    expect(result.nodes.slice(0, 5)).toEqual(['n1', 'n2', 'n3', 'n5', 'n4'])
    expect(rel(w, result.nodes[5] as Pt)).toEqual({ x: -5, y: 20 })
    expect(result.nodes[6]).toBe('n1')
    expect(rel(w, result.moved.get('n1')!)).toEqual({ x: -5, y: 0 })
  })

  it('gives the ends of a line new corners', () => {
    const graph = graphOf(node('n1', 0, 0), node('n2', 10, 0), way('w1', ['n1', 'n2']))
    const w = wayOf(graph)
    const result = extrude(w, sidesOf(w)[0]!, 3, 'corners')
    expect(result.nodes.length).toBe(4)
    expect(rel(w, result.nodes[1] as Pt)).toEqual({ x: 0, y: 3 })
    expect(rel(w, result.nodes[2] as Pt)).toEqual({ x: 10, y: 3 })
  })
})

describe('extrude, move side', () => {
  it('slides the ends along slanted neighbours, which keep their direction', () => {
    // a trapezoid: n1 (0,0), n2 (40,0), n3 (30,10), n4 (10,10); the top is pulled up 10 m
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 40, 0),
      node('n3', 30, 10),
      node('n4', 10, 10),
      way('w1', ['n1', 'n2', 'n3', 'n4', 'n1'], { building: 'yes' }),
    )
    const w = wayOf(graph)
    const result = extrude(w, sideOf(w, 'n3', 'n4'), 10, 'move')
    expect(result.nodes).toEqual(['n1', 'n2', 'n3', 'n4', 'n1'])
    expect(rel(w, result.moved.get('n3')!)).toEqual({ x: 20, y: 20 })
    expect(rel(w, result.moved.get('n4')!)).toEqual({ x: 20, y: 20 })
  })

  it('moves an end straight out when the neighbour runs along the side', () => {
    // n1 (0,0), n2 (10,0), n3 (20,0): n2-n3 moved 4 m north, n1-n2 is in line with it
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 10, 0),
      node('n3', 20, 0),
      way('w1', ['n1', 'n2', 'n3']),
    )
    const w = wayOf(graph)
    const result = extrude(w, sideOf(w, 'n2', 'n3'), 4, 'move')
    expect(rel(w, result.moved.get('n2')!)).toEqual({ x: 10, y: 4 })
    expect(rel(w, result.moved.get('n3')!)).toEqual({ x: 20, y: 4 })
  })
})

describe('extrudeAction', () => {
  it('adds the new corners to this way and moves the moved nodes', () => {
    const graph = graphOf(
      node('n1', 0, 0),
      node('a', 10, 0),
      node('b', 20, 0),
      node('n2', 40, 0),
      node('n3', 40, 20),
      node('n4', 0, 20),
      way('w1', ['n1', 'a', 'b', 'n2', 'n3', 'n4', 'n1'], { building: 'yes' }),
    )
    const w = wayOf(graph)
    const result = extrude(w, sideOf(w, 'a', 'b'), 5, 'corners')
    const after = extrudeAction(w, result)(new Graph(graph))
    const changed = after.entity('w1') as OsmWay
    expect(changed.nodes.length).toBe(9)
    expect(changed.isClosed()).toBe(true)
    const corner = after.entity(changed.nodes[2]!) as OsmNode
    const p = toMetres(w.frame, corner.loc!)
    expect(rel(w, p)).toEqual({ x: 10, y: -5 })
    // the graph it ran on is unchanged
    expect((graph.entity('w1') as OsmWay).nodes.length).toBe(7)
  })
})

describe('snapping', () => {
  /** An L: n1 (0,0), n2 (20,0), n3 (20,10), n4 (10,10), n5 (10,30), n6 (0,30); a lot x1-x4 to the east, 12 m north */
  function lGraph() {
    return graphOf(
      node('n1', 0, 0),
      node('n2', 20, 0),
      node('n3', 20, 10),
      node('n4', 10, 10),
      node('n5', 10, 30),
      node('n6', 0, 30),
      node('x1', 30, 0),
      node('x2', 40, 0),
      node('x3', 40, 12),
      node('x4', 30, 12),
      node('far', 500, 0),
      way('w1', ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n1'], { building: 'yes' }),
      way('w2', ['x1', 'x2', 'x3', 'x4', 'x1'], { amenity: 'parking' }),
    )
  }

  it('takes the corners of the way and of features nearby, without the side and what is far away', () => {
    const graph = lGraph()
    const w = wayOf(graph)
    const targets = snapTargets(graph, w, sideOf(w, 'n3', 'n4'))
    // n1, n2, n5, n6 of the way and x1 to x4: not n3 and n4 (the side), not `far`
    expect(targets.length).toBe(8)
  })

  it('puts the pulled side through a corner within the tolerance', () => {
    const graph = lGraph()
    const w = wayOf(graph)
    const side = sideOf(w, 'n3', 'n4')
    // the side n3-n4 is at y = 10, its outside is north: x3 and x4 are 2 m out
    const targets = snapTargets(graph, w, side)
    const snapped = snapDistance(w, side, 2.4, targets, 0.5)
    expect(snapped.distance).toBeCloseTo(2, 6)
    expect(rel(w, snapped.target!)).toMatchObject({ y: 12 })
    // too far from any corner: the pointer's distance stays
    expect(snapDistance(w, side, 5, targets, 0.5)).toEqual({ distance: 5 })
  })

  it('does not snap back onto the side itself', () => {
    const graph = lGraph()
    const w = wayOf(graph)
    const side = sideOf(w, 'n2', 'n3')
    // n1 lies on the line of n2-n3's neighbour, not on n2-n3; x1 and x4 are 10 m east of n2-n3 (x = 20)
    const targets = snapTargets(graph, w, side)
    expect(snapDistance(w, side, 0.2, targets, 0.5)).toEqual({ distance: 0.2 })
    expect(snapDistance(w, side, 9.7, targets, 0.5).distance).toBeCloseTo(10, 3)
  })
})

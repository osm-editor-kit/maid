import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity, SchemaLookup } from '@osm-editor-kit/maid-model'
import { cutPlan, cutPreview } from './cut.ts'
import type { Loc } from './cut.ts'

/** A context whose tagging schema says `building` is an area key, so a closed building way is an area */
const context = new ModelContext()
context.systems.schema = {
  getScope: () => ({
    variables: new Map(),
    rulesets: new Map(),
    areaKeys: { building: {}, leisure: {} },
  }),
  removeLifecyclePrefix: (key: string) => key,
  matchTags: () => null,
} as unknown as SchemaLookup

// Metres east and north of a point near Berlin; the cut works in its own local metres, so the
// test builds its coordinates the same way and measures areas in the same metres.
const LON0 = 13.4
const LAT0 = 52.5
const DEGREE = (Math.PI * 6378137) / 180
const KX = DEGREE * Math.cos((LAT0 * Math.PI) / 180)
const KY = DEGREE

function at(x: number, y: number): Loc {
  return [LON0 + x / KX, LAT0 + y / KY]
}

function node(id: string, x: number, y: number): OsmNode {
  return new OsmNode(context, { id, loc: at(x, y) })
}

function way(id: string, nodes: string[], tags: Record<string, string> = {}): OsmWay {
  return new OsmWay(context, { id, nodes, tags })
}

function relation(
  id: string,
  tags: Record<string, string>,
  members: { id: string; type: 'way'; role: string }[],
): OsmRelation {
  return new OsmRelation(context, { id, tags, members })
}

function graphOf(...entities: OsmEntity[]): Graph {
  return new Graph(context, entities)
}

/** A 10 m square n0 (0,0), n1 (10,0), n2 (10,10), n3 (0,10), closed way w1 */
function square(tags: Record<string, string> = { building: 'yes' }): OsmEntity[] {
  return [
    node('n0', 0, 0),
    node('n1', 10, 0),
    node('n2', 10, 10),
    node('n3', 0, 10),
    way('w1', ['n0', 'n1', 'n2', 'n3', 'n0'], tags),
  ]
}

/** Area of a closed way in square metres (shoelace in the test's metres) */
function areaOf(graph: Graph, wayId: string): number {
  const w = graph.entity(wayId) as OsmWay
  const pts = w.nodes.slice(0, -1).map((id) => {
    const loc = (graph.entity(id) as OsmNode).loc!
    return { x: (loc[0] - LON0) * KX, y: (loc[1] - LAT0) * KY }
  })
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    sum += a.x * b.y - a.y * b.x
  }
  return Math.abs(sum) / 2
}

/** Plans and applies a cut, as the editor does: the action runs on a copy of the head graph */
function cut(base: Graph, line: Loc[], wayId = 'w1'): { after: Graph; pieces: string[] } {
  const plan = cutPlan(base, wayId, line)
  if ('refused' in plan) throw new Error(`refused: ${plan.refused}`)
  const after = plan.action(new Graph(base))
  return { after, pieces: plan.pieces(after) }
}

/** The ids of the nodes of a way that are not in the base graph (the new crossings and chord points) */
function newNodesOf(graph: Graph, wayId: string, baseIds: string[]): string[] {
  return [...new Set((graph.entity(wayId) as OsmWay).nodes.filter((id) => !baseIds.includes(id)))]
}

const BASE_IDS = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5']

describe('cut: plain closed ways', () => {
  it('cuts a square by a straight line into two rectangles that cover the square', () => {
    const base = graphOf(...square())
    const { after, pieces } = cut(base, [at(3, -5), at(3, 15)])
    expect(pieces).toHaveLength(2)
    const sum = pieces.reduce((total, id) => total + areaOf(after, id), 0)
    expect(Math.abs(sum - 100) / 100).toBeLessThan(1e-6)
    expect(areaOf(after, 'w1')).toBeCloseTo(70, 3)
    for (const id of pieces) {
      const w = after.entity(id) as OsmWay
      expect(w.isClosed()).toBe(true)
    }
  })

  it('cuts a square along a diagonal between two edges into a triangle and a pentagon', () => {
    const base = graphOf(...square())
    const { after, pieces } = cut(base, [at(-2, 2), at(12, 16)])
    expect(pieces).toHaveLength(2)
    const areas = pieces.map((id) => areaOf(after, id)).sort((a, b) => a - b)
    expect(areas[0]).toBeCloseTo(18, 3)
    expect(areas[1]).toBeCloseTo(82, 3)
    const small = pieces.find((id) => Math.abs(areaOf(after, id) - 18) < 1e-3)!
    // the triangle has the two crossings and the corner between them
    expect(new Set((after.entity(small) as OsmWay).nodes).size).toBe(3)
  })

  it('cuts corner to corner into two triangles that reuse the corners', () => {
    const base = graphOf(...square())
    const { after, pieces } = cut(base, [at(-5, -5), at(15, 15)])
    expect(pieces).toHaveLength(2)
    for (const id of pieces) {
      const w = after.entity(id) as OsmWay
      expect(w.nodes.slice(0, -1)).toHaveLength(3)
      expect(areaOf(after, id)).toBeCloseTo(50, 3)
    }
    // Both corners are existing nodes: no node was added
    const nodes = pieces.flatMap((id) => (after.entity(id) as OsmWay).nodes)
    expect(nodes.every((id) => BASE_IDS.includes(id))).toBe(true)
  })

  it('reuses an existing vertex that the line passes through, adding no node there', () => {
    const base = graphOf(...square())
    // the line x + y = 10 passes through the corners n1 (10, 0) and n3 (0, 10)
    const { after, pieces } = cut(base, [at(12, -2), at(-2, 12)])
    expect(pieces).toHaveLength(2)
    const nodes = pieces.flatMap((id) => (after.entity(id) as OsmWay).nodes)
    expect(nodes.every((id) => BASE_IDS.includes(id))).toBe(true)
    expect(nodes.filter((id) => id === 'n1').length).toBeGreaterThan(0)
  })

  it('keeps a bend of the drawn line as new chord nodes shared by both pieces', () => {
    const base = graphOf(...square())
    const { after, pieces } = cut(base, [at(-2, 5), at(4, 5), at(4, 9), at(12, 9)])
    expect(pieces).toHaveLength(2)
    const added = newNodesOf(after, pieces[0]!, ['n0', 'n1', 'n2', 'n3'])
    const addedOther = newNodesOf(after, pieces[1]!, ['n0', 'n1', 'n2', 'n3'])
    // two crossings and the two bend points, in both pieces
    expect(added).toHaveLength(4)
    expect([...added].sort()).toEqual([...addedOther].sort())
    const sum = pieces.reduce((total, id) => total + areaOf(after, id), 0)
    expect(Math.abs(sum - 100) / 100).toBeLessThan(1e-6)
  })

  it('cuts a concave U with a line that crosses it twice', () => {
    const u = [
      node('n0', 0, 0),
      node('n1', 10, 0),
      node('n2', 10, 10),
      node('n3', 7, 10),
      node('n4', 7, 3),
      node('n5', 3, 3),
      node('n6', 3, 10),
      node('n7', 0, 10),
    ]
    const base = graphOf(
      ...u,
      way('w1', ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n0'], { building: 'yes' }),
    )
    const { after, pieces } = cut(base, [at(-2, 1), at(12, 1)])
    expect(pieces).toHaveLength(2)
    // the U is 100 - 4 * 7 = 72 square metres; the strip below y = 1 is 10
    const sum = pieces.reduce((total, id) => total + areaOf(after, id), 0)
    expect(Math.abs(sum - 72) / 72).toBeLessThan(1e-6)
  })

  it('refuses a concave U crossed four times', () => {
    const u = [
      node('n0', 0, 0),
      node('n1', 10, 0),
      node('n2', 10, 10),
      node('n3', 7, 10),
      node('n4', 7, 3),
      node('n5', 3, 3),
      node('n6', 3, 10),
      node('n7', 0, 10),
    ]
    const base = graphOf(
      ...u,
      way('w1', ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n0'], { building: 'yes' }),
    )
    expect(cutPlan(base, 'w1', [at(-2, 6), at(12, 6)])).toEqual({ refused: 'crossings' })
  })

  it('refuses a line that crosses once and ends inside', () => {
    const base = graphOf(...square())
    expect(cutPlan(base, 'w1', [at(-5, 5), at(5, 5)])).toEqual({ refused: 'crossings' })
  })

  it('refuses a line that only touches a corner', () => {
    const base = graphOf(...square())
    expect(cutPlan(base, 'w1', [at(12, 8), at(8, 12)])).toEqual({ refused: 'tangent' })
  })

  it('refuses a line that runs along an edge', () => {
    const base = graphOf(...square())
    expect(cutPlan(base, 'w1', [at(-5, 0), at(15, 0)])).toEqual({ refused: 'along_edge' })
  })

  it('refuses a cut across an edge that another way shares', () => {
    const base = graphOf(
      ...square(),
      node('n5', 10, -10),
      way('w2', ['n0', 'n1', 'n5'], { highway: 'service' }),
    )
    expect(cutPlan(base, 'w1', [at(5, -5), at(5, 15)])).toEqual({ refused: 'shared_edge' })
  })

  it('allows a cut through a vertex that another way shares, and leaves that way unchanged', () => {
    const base = graphOf(
      ...square(),
      node('n4', -10, 0),
      way('w2', ['n0', 'n4'], { highway: 'service' }),
    )
    const { after, pieces } = cut(base, [at(-5, -5), at(15, 15)])
    expect(pieces).toHaveLength(2)
    expect((after.entity('w2') as OsmWay).nodes).toEqual(['n0', 'n4'])
  })

  it('gives the longer piece the id of the way and the other one a new id', () => {
    const base = graphOf(...square())
    const { after, pieces } = cut(base, [at(3, -5), at(3, 15)])
    expect(pieces).toContain('w1')
    const kept = (after.entity('w1') as OsmWay).nodes
    // the 7 m wide piece on the right holds n1 and n2
    expect(kept).toContain('n1')
    expect(kept).toContain('n2')
    expect(kept).not.toContain('n0')
    const other = pieces.find((id) => id !== 'w1')!
    expect((after.entity(other) as OsmWay).nodes).toContain('n0')
  })

  it('gives both pieces all the tags of the way', () => {
    const base = graphOf(...square({ building: 'yes', name: 'Hall', 'addr:street': 'Main' }))
    const { after, pieces } = cut(base, [at(3, -5), at(3, 15)])
    for (const id of pieces) {
      expect((after.entity(id) as OsmWay).tags).toEqual({
        building: 'yes',
        name: 'Hall',
        'addr:street': 'Main',
      })
    }
  })

  it('refuses an open way and a closed way that is not an area', () => {
    const open = graphOf(
      ...square().slice(0, 4),
      way('w1', ['n0', 'n1', 'n2'], { building: 'yes' }),
    )
    expect(cutPlan(open, 'w1', [at(3, -5), at(3, 15)])).toEqual({ refused: 'not_area' })
    const untagged = graphOf(...square({}))
    expect(cutPlan(untagged, 'w1', [at(3, -5), at(3, 15)])).toEqual({ refused: 'not_area' })
  })

  it('refuses a self-intersecting outline', () => {
    const bow = graphOf(
      node('n0', 0, 0),
      node('n1', 10, 10),
      node('n2', 10, 0),
      node('n3', 0, 10),
      way('w1', ['n0', 'n1', 'n2', 'n3', 'n0'], { building: 'yes' }),
    )
    expect(cutPlan(bow, 'w1', [at(-5, 5), at(15, 5)])).toEqual({ refused: 'self_intersecting' })
  })

  it('refuses a cut that would leave a piece too small to be an area, or runs along an edge', () => {
    const base = graphOf(...square())
    // a corner cut off 0.4 m from n2 on both edges: the piece has 0.08 square metres, below 0.3 m squared
    expect(cutPlan(base, 'w1', [at(9, 10.6), at(10.6, 9)])).toEqual({ refused: 'degenerate' })
    // a line 5 mm from the right edge runs along it: refused as along the edge
    expect(cutPlan(base, 'w1', [at(9.995, -5), at(9.995, 15)])).toEqual({ refused: 'along_edge' })
  })

  it('refuses a way that is a member of a route', () => {
    const base = graphOf(
      ...square(),
      relation('r1', { type: 'route', route: 'bicycle' }, [{ id: 'w1', type: 'way', role: '' }]),
    )
    expect(cutPlan(base, 'w1', [at(3, -5), at(3, 15)])).toEqual({ refused: 'relation_member' })
  })

  it('refuses a roundabout', () => {
    const base = graphOf(...square({ junction: 'roundabout', highway: 'primary' }))
    expect(cutPlan(base, 'w1', [at(3, -5), at(3, 15)])).toEqual({ refused: 'roundabout' })
  })

  it('gives a preview chord from the first crossing to the second, and refuses like the plan', () => {
    const base = graphOf(...square())
    const preview = cutPreview(base, 'w1', [at(3, -5), at(3, 5), at(3, 15)])
    expect('chord' in preview).toBe(true)
    if ('chord' in preview) {
      expect(preview.chord).toHaveLength(3)
    }
    expect(cutPreview(base, 'w1', [at(-5, 5), at(5, 5)])).toEqual({ refused: 'crossings' })
  })

  it('does not change the graph it is given, and gives the same result when run again', () => {
    const base = graphOf(...square())
    const before = base.entity('w1')
    const plan = cutPlan(base, 'w1', [at(3, -5), at(3, 15)])
    if ('refused' in plan) throw new Error('refused')
    const first = plan.action(new Graph(base))
    const second = plan.action(new Graph(base))
    expect(base.entity('w1')).toBe(before)
    expect((base.entity('w1') as OsmWay).nodes).toEqual(['n0', 'n1', 'n2', 'n3', 'n0'])
    expect((first.entity('w1') as OsmWay).nodes).toEqual((second.entity('w1') as OsmWay).nodes)
    expect(plan.pieces(first)).toEqual(plan.pieces(second))
  })
})

describe('cut: multipolygons', () => {
  const holeTags = { type: 'multipolygon', building: 'yes' }

  it('splits the outer way into two outer members, with the inner ring kept in the half that holds it', () => {
    const base = graphOf(
      ...square({}),
      node('h0', 1, 4),
      node('h1', 2, 4),
      node('h2', 2, 6),
      node('h3', 1, 6),
      way('w2', ['h0', 'h1', 'h2', 'h3', 'h0']),
      relation('r1', holeTags, [
        { id: 'w1', type: 'way', role: 'outer' },
        { id: 'w2', type: 'way', role: 'inner' },
      ]),
    )
    const { after, pieces } = cut(base, [at(3, -5), at(3, 15)])
    expect(pieces).toHaveLength(2)
    const rel = after.entity('r1') as OsmRelation
    expect(rel.members.map((m) => [m.id, m.role])).toEqual([
      ['w1', 'outer'],
      [pieces.find((id) => id !== 'w1')!, 'outer'],
      ['w2', 'inner'],
    ])
    expect(rel.tags).toEqual(holeTags)
  })

  it('refuses a cut through a hole', () => {
    const base = graphOf(
      ...square({}),
      node('h0', 2, 4),
      node('h1', 4, 4),
      node('h2', 4, 6),
      node('h3', 2, 6),
      way('w2', ['h0', 'h1', 'h2', 'h3', 'h0']),
      relation('r1', holeTags, [
        { id: 'w1', type: 'way', role: 'outer' },
        { id: 'w2', type: 'way', role: 'inner' },
      ]),
    )
    expect(cutPlan(base, 'w1', [at(3, -5), at(3, 15)])).toEqual({ refused: 'through_hole' })
  })

  it('refuses an outline that is one of several outer ways', () => {
    const base = graphOf(
      ...square({}),
      node('m0', 20, 0),
      node('m1', 30, 0),
      node('m2', 30, 10),
      node('m3', 20, 10),
      way('w3', ['m0', 'm1', 'm2', 'm3', 'm0']),
      relation('r1', holeTags, [
        { id: 'w1', type: 'way', role: 'outer' },
        { id: 'w3', type: 'way', role: 'outer' },
      ]),
    )
    expect(cutPlan(base, 'w1', [at(3, -5), at(3, 15)])).toEqual({ refused: 'several_outlines' })
  })

  it('refuses an outline made of several ways', () => {
    const base = graphOf(
      ...square({}),
      way('w3', ['n0', 'n1'], {}),
      relation('r1', holeTags, [
        { id: 'w1', type: 'way', role: 'outer' },
        { id: 'w3', type: 'way', role: 'outer' },
      ]),
    )
    expect(cutPlan(base, 'w1', [at(3, -5), at(3, 15)])).toEqual({ refused: 'multi_way_outline' })
  })
})

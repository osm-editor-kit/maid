import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { divideCells, dividePlan } from './divide.ts'
import type { Loc } from './divide.ts'

const context = new ModelContext()

// Positions are near lon 13.4, lat 52.5. Test shapes are given in metres east and north of that point.
const ORIGIN: Loc = [13.4, 52.5]
const R = 6378137
const DEG = Math.PI / 180
const KX = R * Math.cos(ORIGIN[1] * DEG) * DEG
const KY = R * DEG

type Pt = [number, number]

/** An element of a list, which must exist */
function item<T>(list: readonly T[], index: number): T {
  const value = list[index]
  if (value === undefined) throw new RangeError(`No element at ${index}`)
  return value
}

/** A position `x` metres east and `y` metres north of the origin */
function at(x: number, y: number): Loc {
  return [ORIGIN[0] + x / KX, ORIGIN[1] + y / KY]
}

/** Metres east and north of the origin, for a position in the graph */
function metresOf(loc: Loc): Pt {
  return [(loc[0] - ORIGIN[0]) * KX, (loc[1] - ORIGIN[1]) * KY]
}

/** Signed area of a ring of points in square metres (shoelace) */
function signedArea(ring: Pt[]): number {
  let sum = 0
  ring.forEach(([x1, y1], i) => {
    const [x2, y2] = item(ring, (i + 1) % ring.length)
    sum += x1 * y2 - x2 * y1
  })
  return sum / 2
}

/** Same ring, counter-clockwise (east then north) */
function ccw(ring: Pt[]): Pt[] {
  return signedArea(ring) >= 0 ? ring : [...ring].reverse()
}

/** The overlap of two convex rings, in square metres (Sutherland-Hodgman) */
function overlapArea(subject: Pt[], clipper: Pt[]): number {
  let output = ccw(subject)
  const clip = ccw(clipper)
  clip.forEach((a, i) => {
    const b = item(clip, (i + 1) % clip.length)
    const side = (p: Pt) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    const input = output
    output = []
    input.forEach((p, j) => {
      const q = item(input, (j + 1) % input.length)
      const sp = side(p)
      const sq = side(q)
      if (sp >= 0) output.push(p)
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq)
        output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])])
      }
    })
  })
  return output.length < 3 ? 0 : Math.abs(signedArea(output))
}

const LOT_TAGS = {
  building: 'yes',
  levels: '2',
  name: 'Lot',
  ref: 'L1',
  'addr:street': 'Main Street',
  capacity: '20',
  source: 'survey',
  note: 'draft',
  fixme: 'check',
}

/**
 * A graph with one closed way `w1` of four corner nodes `n1`..`n4`, in the order given.
 * `extra` adds entities (other ways, relations) to the same graph.
 */
function lotGraph(
  corners: [number, number][],
  options: { tags?: Record<string, string>; version?: number; extra?: OsmEntity[] } = {},
): Graph {
  const nodes = corners.map(([x, y], i) => new OsmNode(context, { id: `n${i + 1}`, loc: at(x, y) }))
  const ids = nodes.map((node) => node.id)
  const way = new OsmWay(context, {
    id: 'w1',
    nodes: [...ids, ...ids.slice(0, 1)],
    tags: options.tags ?? LOT_TAGS,
    version: options.version,
  })
  return new Graph(context, [...nodes, way, ...(options.extra ?? [])])
}

const RECTANGLE: [number, number][] = [
  [0, 0],
  [40, 0],
  [40, 20],
  [0, 20],
]
const PARALLELOGRAM: [number, number][] = [
  [0, 0],
  [40, 0],
  [60, 20],
  [20, 20],
]
const TRAPEZOID: [number, number][] = [
  [0, 0],
  [40, 0],
  [30, 20],
  [10, 20],
]

/** The result of a plan that must not be refused */
function planOf(graph: Graph, wayId: string, columns: number, rows: number) {
  const plan = dividePlan(graph, wayId, columns, rows)
  if (!('action' in plan)) throw new Error(`refused: ${plan.refused}`)
  return plan
}

/** Applies a plan to a copy of the base graph, as the editor does */
function apply(base: Graph, columns: number, rows: number, wayId = 'w1') {
  const plan = planOf(base, wayId, columns, rows)
  const after = plan.action(new Graph(base))
  return { after, parts: plan.parts(after) }
}

/** The corner positions of a way in metres, without the closing node */
function ringOf(graph: Graph, wayId: string): [Pt, Pt, Pt, Pt] {
  const way = graph.entity(wayId) as OsmWay
  const [a, b, c, d] = way.nodes
    .slice(0, -1)
    .map((id) => metresOf((graph.entity(id) as OsmNode).loc as Loc))
  if (!a || !b || !c || !d) throw new Error(`${wayId} is not a four-cornered way`)
  return [a, b, c, d]
}

/** Sum of the areas of the parts, in square metres */
function sumOfAreas(graph: Graph, parts: string[]): number {
  return parts.reduce((sum, id) => sum + Math.abs(signedArea(ringOf(graph, id))), 0)
}

describe('divideCells (the preview geometry)', () => {
  it('makes columns times rows cells, each of four positions, row by row from A', () => {
    const corners = RECTANGLE.map(([x, y]) => at(x, y)) as [Loc, Loc, Loc, Loc]
    const cells = divideCells(corners, 4, 2)
    expect(cells).toHaveLength(8)
    expect(cells.every((cell) => cell.length === 4)).toBe(true)
    // The first cell starts at corner A and the last ends at corner C, exactly
    expect(item(item(cells, 0), 0)).toEqual(corners[0])
    expect(item(item(cells, 7), 2)).toEqual(corners[2])
  })

  it('gives a single cell for 1 x 1 that is the whole shape', () => {
    const corners = TRAPEZOID.map(([x, y]) => at(x, y)) as [Loc, Loc, Loc, Loc]
    const cell = item(divideCells(corners, 1, 1), 0)
    cell.forEach((loc, i) => {
      const [x, y] = metresOf(loc)
      const [wantX, wantY] = item(TRAPEZOID, i)
      expect(x).toBeCloseTo(wantX, 6)
      expect(y).toBeCloseTo(wantY, 6)
    })
  })
})

describe('dividePlan: counts and areas', () => {
  it('makes columns times rows parts, the first one keeping the source id', () => {
    const { parts } = apply(lotGraph(RECTANGLE), 4, 2)
    expect(parts).toHaveLength(8)
    expect(item(parts, 0)).toBe('w1')
    expect(new Set(parts).size).toBe(8)
  })

  it('sums to the source area for a rectangle, a parallelogram and a trapezoid', () => {
    for (const [shape, expected] of [
      [RECTANGLE, 800],
      [PARALLELOGRAM, 800],
      [TRAPEZOID, 600],
    ] as const) {
      const base = lotGraph(shape)
      expect(Math.abs(signedArea(ringOf(base, 'w1')))).toBeCloseTo(expected, 6)
      const { after, parts } = apply(base, 3, 4)
      expect(Math.abs(sumOfAreas(after, parts) - expected) / expected).toBeLessThan(1e-6)
    }
  })

  it('gives parallelogram parts that are all the same shape and size', () => {
    const { after, parts } = apply(lotGraph(PARALLELOGRAM), 4, 2)
    const [f0, f1, , f3] = ringOf(after, item(parts, 0))
    const edge1: Pt = [f1[0] - f0[0], f1[1] - f0[1]]
    const edge2: Pt = [f3[0] - f0[0], f3[1] - f0[1]]
    for (const id of parts) {
      const [r0, r1, , r3] = ringOf(after, id)
      expect(Math.abs(signedArea(ringOf(after, id)))).toBeCloseTo(100, 6)
      expect(r1[0] - r0[0]).toBeCloseTo(edge1[0], 6)
      expect(r1[1] - r0[1]).toBeCloseTo(edge1[1], 6)
      expect(r3[0] - r0[0]).toBeCloseTo(edge2[0], 6)
      expect(r3[1] - r0[1]).toBeCloseTo(edge2[1], 6)
    }
  })

  it('gives rectangle parts with right angles and equal opposite sides', () => {
    const { after, parts } = apply(lotGraph(RECTANGLE), 4, 2)
    for (const id of parts) {
      const [a, b, c, d] = ringOf(after, id)
      const ab: Pt = [b[0] - a[0], b[1] - a[1]]
      const bc: Pt = [c[0] - b[0], c[1] - b[1]]
      const dc: Pt = [c[0] - d[0], c[1] - d[1]]
      const ad: Pt = [d[0] - a[0], d[1] - a[1]]
      expect(ab[0] * bc[0] + ab[1] * bc[1]).toBeCloseTo(0, 6)
      expect(Math.hypot(...ab)).toBeCloseTo(Math.hypot(...dc), 6)
      expect(Math.hypot(...bc)).toBeCloseTo(Math.hypot(...ad), 6)
      expect(Math.hypot(...ab)).toBeCloseTo(10, 6)
    }
  })

  it('gives parts that do not overlap', () => {
    for (const shape of [RECTANGLE, PARALLELOGRAM, TRAPEZOID]) {
      const { after, parts } = apply(lotGraph(shape), 3, 3)
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          expect(
            overlapArea(ringOf(after, item(parts, i)), ringOf(after, item(parts, j))),
          ).toBeLessThan(1e-6)
        }
      }
    }
  })
})

describe('dividePlan: shared nodes and ids', () => {
  it('makes (columns + 1) x (rows + 1) grid nodes, with the four corners reused', () => {
    const base = lotGraph(RECTANGLE)
    const { after, parts } = apply(base, 4, 2)
    const used = new Set(parts.flatMap((id) => (after.entity(id) as OsmWay).nodes))
    expect(used.size).toBe((4 + 1) * (2 + 1))
    for (const corner of ['n1', 'n2', 'n3', 'n4']) {
      expect(used.has(corner)).toBe(true)
    }
    // Each new node is a new entity with a negative (editor) id, and no node is created twice
    const created = [...used].filter((id) => !['n1', 'n2', 'n3', 'n4'].includes(id))
    expect(created).toHaveLength(11)
    expect(created.every((id) => /^n-\d+$/.test(id))).toBe(true)
  })

  it('shares each cut node between its neighbouring parts', () => {
    const { after, parts } = apply(lotGraph(RECTANGLE), 4, 2)
    const count = new Map<string, number>()
    for (const id of parts) {
      for (const node of (after.entity(id) as OsmWay).nodes.slice(0, -1)) {
        count.set(node, (count.get(node) ?? 0) + 1)
      }
    }
    // Corners: 1 part each. Other edge nodes: 2 parts. Inside the grid: 4 parts.
    // For 4 x 2: 4 corners, 6 + 2 = 8 edge nodes, 3 inside. 4 + 16 + 12 = 32 = 8 parts x 4 corners.
    const values = [...count.values()]
    expect(values.filter((n) => n === 1)).toHaveLength(4)
    expect(values.filter((n) => n === 2)).toHaveLength(8)
    expect(values.filter((n) => n === 4)).toHaveLength(3)
    expect(values.reduce((a, b) => a + b, 0)).toBe(8 * 4)
  })

  it('gives the new ways new ids, and orders the parts row by row from corner A', () => {
    const { after, parts } = apply(lotGraph(RECTANGLE), 4, 2)
    expect(parts.slice(1).every((id) => /^w-\d+$/.test(id))).toBe(true)
    // item(parts, 0) starts at A (n1); the last part of the first row ends at B (n2)
    expect((after.entity(item(parts, 0)) as OsmWay).nodes).toContain('n1')
    expect((after.entity(item(parts, 3)) as OsmWay).nodes).toContain('n2')
    // the last part is the top right cell, at corner C (n3)
    expect((after.entity(item(parts, 7)) as OsmWay).nodes).toContain('n3')
  })

  it('keeps the source way history: same id and version on the first part', () => {
    const { after, parts } = apply(lotGraph(RECTANGLE, { version: 3 }), 2, 1)
    expect(item(parts, 0)).toBe('w1')
    expect(after.entity('w1').version).toBe(3)
    expect(after.entity(item(parts, 1)).version).toBeUndefined()
  })

  it('gives the same ids when the plan is applied again (redo)', () => {
    const base = lotGraph(RECTANGLE)
    const plan = planOf(base, 'w1', 3, 2)
    const first = plan.parts(plan.action(new Graph(base)))
    const second = plan.parts(plan.action(new Graph(base)))
    expect(second).toEqual(first)
  })

  it('leaves the base graph unchanged', () => {
    const base = lotGraph(RECTANGLE)
    const before = (base.entity('w1') as OsmWay).nodes
    apply(base, 4, 2)
    expect((base.entity('w1') as OsmWay).nodes).toEqual(before)
  })
})

describe('dividePlan: tags', () => {
  it('copies the tags except name, ref, addr:*, capacity, source, note and fixme', () => {
    const { after, parts } = apply(lotGraph(RECTANGLE), 2, 2)
    for (const id of parts) {
      expect(after.entity(id).tags).toEqual({ building: 'yes', levels: '2' })
    }
  })
})

describe('dividePlan: refusals', () => {
  it('refuses a shape that is not four corners', () => {
    const triangle = lotGraph([
      [0, 0],
      [40, 0],
      [20, 20],
    ])
    expect(dividePlan(triangle, 'w1', 2, 2)).toEqual({ refused: 'not_four_corners' })

    const five = lotGraph([
      [0, 0],
      [40, 0],
      [40, 20],
      [20, 25],
      [0, 20],
    ])
    expect(dividePlan(five, 'w1', 2, 2)).toEqual({ refused: 'not_four_corners' })

    const open = new Graph(context, [
      new OsmNode(context, { id: 'n1', loc: at(0, 0) }),
      new OsmNode(context, { id: 'n2', loc: at(40, 0) }),
      new OsmNode(context, { id: 'n3', loc: at(40, 20) }),
      new OsmNode(context, { id: 'n4', loc: at(0, 20) }),
      new OsmWay(context, { id: 'w1', nodes: ['n1', 'n2', 'n3', 'n4'], tags: LOT_TAGS }),
    ])
    expect(dividePlan(open, 'w1', 2, 2)).toEqual({ refused: 'not_four_corners' })

    const repeated = new Graph(context, [
      new OsmNode(context, { id: 'n1', loc: at(0, 0) }),
      new OsmNode(context, { id: 'n2', loc: at(40, 0) }),
      new OsmNode(context, { id: 'n4', loc: at(0, 20) }),
      new OsmWay(context, { id: 'w1', nodes: ['n1', 'n2', 'n1', 'n4', 'n1'], tags: LOT_TAGS }),
    ])
    expect(dividePlan(repeated, 'w1', 2, 2)).toEqual({ refused: 'not_four_corners' })

    expect(dividePlan(lotGraph(RECTANGLE), 'w-missing', 2, 2)).toEqual({
      refused: 'not_four_corners',
    })
  })

  it('refuses a concave shape and a self-intersecting one', () => {
    const dart = lotGraph([
      [0, 0],
      [40, 0],
      [10, 10],
      [0, 20],
    ])
    expect(dividePlan(dart, 'w1', 2, 2)).toEqual({ refused: 'concave' })

    const bowtie = lotGraph([
      [0, 0],
      [40, 20],
      [40, 0],
      [0, 20],
    ])
    expect(dividePlan(bowtie, 'w1', 2, 2)).toEqual({ refused: 'concave' })
  })

  it('refuses a source that is a member of a relation', () => {
    const relation = new OsmRelation(context, {
      id: 'r1',
      tags: { type: 'multipolygon' },
      members: [{ id: 'w1', type: 'way', role: 'outer' }],
    })
    const graph = lotGraph(RECTANGLE, { extra: [relation] })
    expect(dividePlan(graph, 'w1', 2, 2)).toEqual({ refused: 'in_relation' })
  })

  it('refuses new nodes on an edge that another way shares', () => {
    const neighbour = new OsmWay(context, {
      id: 'w2',
      nodes: ['n1', 'n2'],
      tags: { highway: 'service' },
    })
    const graph = lotGraph(RECTANGLE, { extra: [neighbour] })
    // columns > 1 puts new nodes on A-B, which w2 shares
    expect(dividePlan(graph, 'w1', 2, 1)).toEqual({ refused: 'shared_edge' })
    // with one column, A-B gets no new node, so the neighbour is not affected
    expect(dividePlan(graph, 'w1', 1, 2)).toHaveProperty('action')
  })

  it('refuses more than 200 parts, and allows exactly 200', () => {
    const graph = lotGraph(RECTANGLE)
    expect(dividePlan(graph, 'w1', 15, 14)).toEqual({ refused: 'too_many_parts' })
    expect(dividePlan(graph, 'w1', 10, 20)).toHaveProperty('action')
  })

  it('says nothing to do for 1 x 1', () => {
    expect(dividePlan(lotGraph(RECTANGLE), 'w1', 1, 1)).toEqual({ refused: 'nothing_to_do' })
  })

  it('throws for sizes that are not whole numbers of at least 1', () => {
    expect(() => dividePlan(lotGraph(RECTANGLE), 'w1', 0, 2)).toThrow(RangeError)
    expect(() => dividePlan(lotGraph(RECTANGLE), 'w1', 2.5, 2)).toThrow(RangeError)
  })
})

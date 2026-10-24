import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { fromAxes, heightOf, resizeExtent, widthOf, axesOf } from './box.ts'
import { movesFor, resizeApplies, resizeBoxOf, type ResizeBox } from './resize.ts'

const context = new ModelContext()

const ORIGIN = [13.4, 52.5] as const
const R = 6378137
const DEG = Math.PI / 180
const KX = R * Math.cos(ORIGIN[1] * DEG) * DEG
const KY = R * DEG

/** A position `x` metres east and `y` metres north of the origin */
function at(x: number, y: number): [number, number] {
  return [ORIGIN[0] + x / KX, ORIGIN[1] + y / KY]
}

/** Metres east and north of the origin for a position (the inverse of `at`) */
function metresOf([lon, lat]: [number, number]) {
  return { x: (lon - ORIGIN[0]) * KX, y: (lat - ORIGIN[1]) * KY }
}

/** A closed way with its nodes, through the corners in metres. Node ids are `<prefix>1`, `<prefix>2`, … */
function building(id: string, prefix: string, corners: [number, number][]): OsmEntity[] {
  const nodes = corners.map(
    ([x, y], i) => new OsmNode(context, { id: `${prefix}${i + 1}`, loc: at(x, y) }),
  )
  const ids = nodes.map((node) => node.id)
  return [
    ...nodes,
    new OsmWay(context, { id, nodes: [...ids, ids[0]!], tags: { building: 'yes' } }),
  ]
}

const RECTANGLE: [number, number][] = [
  [0, 0],
  [40, 0],
  [40, 20],
  [0, 20],
]

function boxOf(graph: Graph, ids: string[]): ResizeBox {
  const box = resizeBoxOf(graph, ids)
  if ('refused' in box) throw new Error(`refused: ${box.refused}`)
  return box
}

/** The distance between two positions in metres */
function metresBetween(a: [number, number], b: [number, number]) {
  const p = metresOf(a)
  const q = metresOf(b)
  return Math.hypot(p.x - q.x, p.y - q.y)
}

describe('resizeApplies', () => {
  it('applies to a way, a relation, or three nodes, not to one or two nodes', () => {
    const graph = new Graph(context, [
      ...building('w1', 'n', RECTANGLE),
      new OsmNode(context, { id: 'p1', loc: at(100, 0) }),
      new OsmNode(context, { id: 'p2', loc: at(110, 0) }),
      new OsmNode(context, { id: 'p3', loc: at(110, 10) }),
    ])
    expect(resizeApplies(graph, ['w1'])).toBe(true)
    expect(resizeApplies(graph, ['w1', 'p1'])).toBe(true)
    expect(resizeApplies(graph, ['p1', 'p2', 'p3'])).toBe(true)
    expect(resizeApplies(graph, ['p1'])).toBe(false)
    expect(resizeApplies(graph, ['p1', 'p2'])).toBe(false)
    expect(resizeApplies(graph, ['w9'])).toBe(false)
    expect(resizeApplies(graph, [])).toBe(false)
  })
})

describe('resizeBoxOf', () => {
  it('fits a box along a building, 40 by 20 m', () => {
    const box = boxOf(new Graph(context, building('w1', 'n', RECTANGLE)), ['w1'])
    expect(box.nodes.size).toBe(4)
    expect(widthOf(box.extent)).toBeCloseTo(40, 2)
    expect(heightOf(box.extent)).toBeCloseTo(20, 2)
  })

  it('turns the box with a building that is turned by 30°', () => {
    const axes = axesOf(Math.PI / 6)
    const turned = RECTANGLE.map(([x, y]) => {
      const p = fromAxes(axes, { x, y })
      return [p.x, p.y] as [number, number]
    })
    const box = boxOf(new Graph(context, building('w1', 'n', turned)), ['w1'])
    expect(box.axes.angle).toBeCloseTo(Math.PI / 6, 3)
    expect(widthOf(box.extent)).toBeCloseTo(40, 2)
    expect(heightOf(box.extent)).toBeCloseTo(20, 2)
  })

  it('puts one box around a group, with its points', () => {
    const graph = new Graph(context, [
      ...building('w1', 'a', RECTANGLE),
      ...building('w2', 'b', [
        [60, 0],
        [80, 0],
        [80, 10],
        [60, 10],
      ]),
      new OsmNode(context, { id: 'p1', loc: at(70, 30), tags: { amenity: 'bench' } }),
    ])
    const box = boxOf(graph, ['w1', 'w2', 'p1'])
    expect(box.nodes.size).toBe(9)
    expect(widthOf(box.extent)).toBeCloseTo(80, 2)
    expect(heightOf(box.extent)).toBeCloseTo(30, 2)
  })

  it('takes the member ways of a multipolygon', () => {
    const graph = new Graph(context, [
      ...building('w1', 'a', RECTANGLE),
      ...building('w2', 'b', [
        [10, 5],
        [20, 5],
        [20, 15],
        [10, 15],
      ]),
      new OsmRelation(context, {
        id: 'r1',
        tags: { type: 'multipolygon', building: 'yes' },
        members: [
          { id: 'w1', type: 'way', role: 'outer' },
          { id: 'w2', type: 'way', role: 'inner' },
        ],
      }),
    ])
    expect(boxOf(graph, ['r1']).nodes.size).toBe(8)
  })

  it('refuses a straight line, and a relation with a member that is not loaded', () => {
    const line = [
      new OsmNode(context, { id: 'n1', loc: at(0, 0) }),
      new OsmNode(context, { id: 'n2', loc: at(30, 0) }),
      new OsmWay(context, { id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'service' } }),
    ]
    expect(resizeBoxOf(new Graph(context, line), ['w1'])).toEqual({ refused: 'too_thin' })
    const relation = new OsmRelation(context, {
      id: 'r1',
      tags: { type: 'multipolygon' },
      members: [{ id: 'w9', type: 'way', role: 'outer' }],
    })
    expect(resizeBoxOf(new Graph(context, [relation]), ['r1'])).toEqual({ refused: 'incomplete' })
  })
})

describe('movesFor', () => {
  it('stretches a building to 60 by 20 m, keeping the far wall and the right angles', () => {
    const graph = new Graph(context, building('w1', 'n', RECTANGLE))
    const box = boxOf(graph, ['w1'])
    const east = { x: box.extent.maxU + 20, y: 0 }
    const moves = new Map(
      movesFor(box, resizeExtent(box.extent, 'e', east, { proportional: false, centre: false })),
    )
    const n1 = moves.get('n1')!
    const n2 = moves.get('n2')!
    const n3 = moves.get('n3')!
    const n4 = moves.get('n4')!
    expect(metresBetween(n1, at(0, 0))).toBeLessThan(0.001)
    expect(metresBetween(n4, at(0, 20))).toBeLessThan(0.001)
    expect(metresBetween(n1, n2)).toBeCloseTo(60, 2)
    expect(metresBetween(n2, n3)).toBeCloseTo(20, 2)
    // the corner at n2 stays a right angle
    const a = metresOf(n1)
    const b = metresOf(n2)
    const c = metresOf(n3)
    const dot = (a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)
    expect(Math.abs(dot)).toBeLessThan(0.01)
  })

  it('keeps the right angles of a turned building along its own axes', () => {
    const axes = axesOf(0.5)
    const turned = RECTANGLE.map(([x, y]) => {
      const p = fromAxes(axes, { x, y })
      return [p.x, p.y] as [number, number]
    })
    const graph = new Graph(context, building('w1', 'n', turned))
    const box = boxOf(graph, ['w1'])
    const moves = new Map(
      movesFor(
        box,
        resizeExtent(
          box.extent,
          'n',
          { x: 0, y: box.extent.maxV + 10 },
          {
            proportional: false,
            centre: false,
          },
        ),
      ),
    )
    const [a, b, c] = ['n1', 'n2', 'n3'].map((id) => metresOf(moves.get(id)!))
    const dot = (a!.x - b!.x) * (c!.x - b!.x) + (a!.y - b!.y) * (c!.y - b!.y)
    expect(Math.abs(dot)).toBeLessThan(0.01)
    expect(Math.hypot(a!.x - b!.x, a!.y - b!.y)).toBeCloseTo(40, 2)
    expect(Math.hypot(c!.x - b!.x, c!.y - b!.y)).toBeCloseTo(30, 2)
  })

  it('moves a node shared with an unselected way along with the box', () => {
    const graph = new Graph(context, [
      ...building('w1', 'n', RECTANGLE),
      new OsmNode(context, { id: 'x1', loc: at(80, 0) }),
      new OsmWay(context, { id: 'w2', nodes: ['n2', 'x1'], tags: { highway: 'footway' } }),
    ])
    const box = boxOf(graph, ['w1'])
    const moves = new Map(
      movesFor(
        box,
        resizeExtent(
          box.extent,
          'e',
          { x: box.extent.maxU + 10, y: 0 },
          {
            proportional: false,
            centre: false,
          },
        ),
      ),
    )
    expect(moves.has('n2')).toBe(true)
    expect(moves.has('x1')).toBe(false)
    expect(metresBetween(moves.get('n2')!, at(50, 0))).toBeLessThan(0.001)
  })
})

import { describe, expect, it } from 'bun:test'
import { frameAt, toMetres, type Loc } from '../shared/metres.ts'
import type { Pt } from '../shared/vector.ts'
import { cutPlan } from './cut.ts'
import { defaultLine, lineAcross } from './default-line.ts'
import type { Line } from './line.ts'
import { at, graphOf, node, square, way } from './test-graph.ts'

/** The positions of an outline in metres, at x (east) and y (north) from the test origin */
function corners(points: [number, number][]): Loc[] {
  return points.map(([x, y]) => at(x, y))
}

/** The two ends of a line in the metres of the outline's frame: the frame the default line is made in */
function endsIn(outline: Loc[], line: Line): Pt[] {
  const frame = frameAt(outline)
  return line.map((loc) => toMetres(frame, loc))
}

describe('the default cut line: a rectangle', () => {
  const outline = corners([
    [0, 0],
    [20, 0],
    [20, 10],
    [0, 10],
  ])

  it('is perpendicular to the long side, through the centre, and reaches 3 m past each long side', () => {
    const [start, end] = endsIn(outline, lineAcross(outline)!)
    // the metres are from the centre: the long sides run east, so the line runs north through the centre
    expect(start!.x).toBeCloseTo(0, 3)
    expect(end!.x).toBeCloseTo(0, 3)
    // 10 m across, 15% is 1.5 m, so the 3 m minimum applies: the ends are 5 + 3 m from the centre
    expect(start!.y).toBeCloseTo(-8, 3)
    expect(end!.y).toBeCloseTo(8, 3)
  })

  it('splits the long sides in half: the line passes through the centre of the area', () => {
    const [start, end] = endsIn(outline, defaultLine(graphOf(...rectangle()), 'w1')!)
    expect((start!.x + end!.x) / 2).toBeCloseTo(0, 3)
    expect((start!.y + end!.y) / 2).toBeCloseTo(0, 3)
  })

  it('works for a rotated rectangle: the line is perpendicular to the longer side, and both ends are outside', () => {
    const angle = Math.PI / 6
    const rotate = ([x, y]: [number, number]): [number, number] => [
      x * Math.cos(angle) - y * Math.sin(angle),
      x * Math.sin(angle) + y * Math.cos(angle),
    ]
    const turned = (
      [
        [0, 0],
        [30, 0],
        [30, 10],
        [0, 10],
      ] as [number, number][]
    ).map(rotate)
    const shape = corners(turned)
    const [start, end] = endsIn(shape, lineAcross(shape)!)
    const direction = { x: end!.x - start!.x, y: end!.y - start!.y }
    const length = Math.hypot(direction.x, direction.y)
    // the long side points along the angle: the line is across it
    const dot = (direction.x * Math.cos(angle) + direction.y * Math.sin(angle)) / length
    expect(Math.abs(dot)).toBeLessThan(1e-4)
    // the centre is (15, 5) turned; the short side is 10 m, so a point on the line is outside beyond 5 m from it
    const centre = { x: (start!.x + end!.x) / 2, y: (start!.y + end!.y) / 2 }
    expect(centre.x).toBeCloseTo(0, 3)
    expect(centre.y).toBeCloseTo(0, 3)
    expect(Math.hypot(start!.x - centre.x, start!.y - centre.y)).toBeGreaterThan(5)
    expect(Math.hypot(end!.x - centre.x, end!.y - centre.y)).toBeGreaterThan(5)
  })
})

describe('the default cut line makes a valid cut', () => {
  it('cuts a square into two closed ways with the tags of the square', () => {
    const graph = graphOf(...square())
    const line = defaultLine(graph, 'w1')!
    const plan = cutPlan(graph, 'w1', [...line])
    expect('refused' in plan).toBe(false)
    if ('refused' in plan) return
    const after = plan.action(graph)
    const pieces = plan.pieces(after)
    expect(pieces).toHaveLength(2)
    for (const id of pieces) expect(after.entity(id).tags).toEqual({ building: 'yes' })
  })

  it('cuts a convex parallelogram into two, across its principal axis', () => {
    const outline = corners([
      [0, 0],
      [40, 0],
      [50, 10],
      [10, 10],
    ])
    const graph = graphOf(
      node('a', 0, 0),
      node('b', 40, 0),
      node('c', 50, 10),
      node('d', 10, 10),
      way('w1', ['a', 'b', 'c', 'd', 'a'], { building: 'yes' }),
    )
    const line = defaultLine(graph, 'w1')!
    const [start, end] = endsIn(outline, line)
    // the long axis is nearly east (about 4 degrees): the line is nearly north
    const length = Math.hypot(end!.x - start!.x, end!.y - start!.y)
    expect(Math.abs(end!.x - start!.x) / length).toBeLessThan(0.2)
    const plan = cutPlan(graph, 'w1', [...line])
    expect('refused' in plan).toBe(false)
  })
})

describe('the default cut line: no size, no line', () => {
  it('gives nothing for three points on one line', () => {
    expect(
      lineAcross(
        corners([
          [0, 0],
          [5, 0],
          [10, 0],
        ]),
      ),
    ).toBeUndefined()
  })

  it('gives nothing for a way that is not a way', () => {
    expect(defaultLine(graphOf(...square()), 'n0')).toBeUndefined()
  })
})

/** A 20 m by 10 m rectangle as the closed way w1 with building=yes */
function rectangle() {
  return [
    node('n0', 0, 0),
    node('n1', 20, 0),
    node('n2', 20, 10),
    node('n3', 0, 10),
    way('w1', ['n0', 'n1', 'n2', 'n3', 'n0'], { building: 'yes' }),
  ]
}

/**
 * The street drawing on made-up roads, after the cases of Lane Studio's geometry tests (roads running on, a lane added,
 * a T-junction, a crossroads, a road splitting into two one-way roads, a ring): the roads meet without steps or gaps,
 * side roads stop at the main road's kerb, junction outlines do not cross themselves.
 */
import { describe, expect, it } from 'bun:test'
import { streetGeometry } from './street'
import type { StreetGeometry, StreetLane, StreetWay } from './types'

const ORIGIN = [13.4, 52.5] as const
const KX = Math.cos((ORIGIN[1] * Math.PI) / 180) * 6_378_137 * (Math.PI / 180)
const KY = 6_378_137 * (Math.PI / 180)
const toLoc = (x: number, y: number): [number, number] => [ORIGIN[0] + x / KX, ORIGIN[1] + y / KY]
const toMetres = (loc: readonly [number, number]): [number, number] => [
  (loc[0] - ORIGIN[0]) * KX,
  (loc[1] - ORIGIN[1]) * KY,
]

function lanes(spec: string, width = 3): StreetLane[] {
  // `b` backward, `f` forward, `x` both ways; left to right, the way's line in the middle of the road
  const total = spec.length * width
  return spec.split('').map((c, i) => ({
    id: `${c}${i}`,
    left: -total / 2 + i * width,
    right: -total / 2 + (i + 1) * width,
    direction: c === 'b' ? 'backward' : c === 'x' ? 'both_ways' : 'forward',
    kind: 'car',
  }))
}

type TestWay = Omit<StreetWay, 'tags'> & { tags?: StreetWay['tags'] }
function build(nodes: Record<string, [number, number]>, ways: TestWay[]) {
  return streetGeometry({
    ways: ways.map((way) => ({ tags: { highway: 'secondary' }, ...way })),
    loc: (id) => (nodes[id] ? toLoc(...nodes[id]!) : undefined),
  })
}

const distance = (a: readonly [number, number], b: readonly [number, number]) => {
  const [ax, ay] = toMetres(a)
  const [bx, by] = toMetres(b)
  return Math.hypot(ax - bx, ay - by)
}

/** Points of the lanes of a way, in metres */
const pointsOf = (geometry: StreetGeometry, wayId: string) =>
  geometry.lanes
    .filter((lane) => lane.wayId === wayId && !lane.taper)
    .flatMap((lane) => lane.ring.map(toMetres))

function segmentsCross(a: number[], b: number[], c: number[], d: number[]) {
  const o = (p: number[], q: number[], r: number[]) =>
    Math.sign((q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!))
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}

function selfIntersects(ring: [number, number][]) {
  const pts = ring.map(toMetres)
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 2; j < pts.length; j++) {
      if (i === 0 && j === pts.length - 1) continue
      if (segmentsCross(pts[i]!, pts[(i + 1) % pts.length]!, pts[j]!, pts[(j + 1) % pts.length]!))
        return true
    }
  }
  return false
}

describe('streetGeometry: roads running on', () => {
  it('two ways in a straight line meet edge to edge', () => {
    const g = build({ a: [-100, 0], b: [0, 0], c: [100, 0] }, [
      { id: 'w1', nodes: ['a', 'b'], lanes: lanes('bf') },
      { id: 'w2', nodes: ['b', 'c'], lanes: lanes('bf') },
    ])
    expect(g.junctions).toHaveLength(0)
    expect(g.lanes).toHaveLength(4)
    // every corner at the node of one way is a corner of the other
    const atNode = (wayId: string) => pointsOf(g, wayId).filter(([x]) => Math.abs(x) < 0.01)
    for (const p of atNode('w1'))
      expect(atNode('w2').some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01)).toBe(true)
  })

  it('a bend is cut on its bisector, so the lanes meet without a gap', () => {
    const g = build({ a: [-100, 0], b: [0, 0], c: [70, 70] }, [
      { id: 'w1', nodes: ['a', 'b'], lanes: lanes('bf') },
      { id: 'w2', nodes: ['b', 'c'], lanes: lanes('bf') },
    ])
    const ends = g.lanes.filter((l) => l.wayId === 'w1').flatMap((l) => [l.ring[1]!, l.ring[2]!])
    const starts = g.lanes
      .filter((l) => l.wayId === 'w2')
      .flatMap((l) => [l.ring[0]!, l.ring[l.ring.length - 1]!])
    for (const p of ends) expect(Math.min(...starts.map((q) => distance(p, q)))).toBeLessThan(0.01)
  })

  it('a way drawn the other way round meets with its lanes matched by direction', () => {
    const g = build({ a: [-100, 0], b: [0, 0], c: [100, 0] }, [
      { id: 'w1', nodes: ['a', 'b'], lanes: lanes('bf') },
      { id: 'w2', nodes: ['c', 'b'], lanes: lanes('bf') },
    ])
    // no run: the lanes match once the second way is read the other way round
    expect(g.lanes.filter((l) => l.taper)).toHaveLength(0)
  })

  it('a lane added on a one-way road narrows to nothing on the road with fewer lanes', () => {
    const g = build({ a: [-100, 0], b: [0, 0], c: [100, 0] }, [
      {
        id: 'w1',
        nodes: ['a', 'b'],
        lanes: lanes('ff'),
        tags: { highway: 'secondary', oneway: 'yes' },
      },
      {
        id: 'w2',
        nodes: ['b', 'c'],
        lanes: lanes('fff'),
        tags: { highway: 'secondary', oneway: 'yes' },
      },
    ])
    const tapers = g.lanes.filter((l) => l.taper)
    expect(tapers).toHaveLength(1)
    expect(tapers[0]!.wayId).toBe('w1')
    // at the node the narrower road is as wide as the wider one
    const ys = pointsOf(g, 'w1')
      .concat(tapers[0]!.ring.map(toMetres))
      .filter(([x]) => Math.abs(x) < 0.01)
      .map(([, y]) => y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(9, 1)
    // 25 m back it is its own width again
    const back = pointsOf(g, 'w1')
      .filter(([x]) => x < -30)
      .map(([, y]) => y)
    expect(Math.max(...back) - Math.min(...back)).toBeCloseTo(6, 1)
  })

  it('a carriageway without lanes widens to the kerbs of a road with lanes, without tapers', () => {
    const g = build({ a: [-100, 0], b: [0, 0], c: [100, 0] }, [
      { id: 'w1', nodes: ['a', 'b'], lanes: lanes('x', 5) },
      { id: 'w2', nodes: ['b', 'c'], lanes: lanes('bbff') },
    ])
    expect(g.lanes.filter((l) => l.taper)).toHaveLength(0)
    const ys = pointsOf(g, 'w1')
      .filter(([x]) => Math.abs(x) < 0.01)
      .map(([, y]) => y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(12, 1)
  })

  it('a closed way (a ring) meets itself', () => {
    const g = build({ a: [0, -30], b: [30, 0], c: [0, 30], d: [-30, 0] }, [
      {
        id: 'w1',
        nodes: ['a', 'b', 'c', 'd', 'a'],
        lanes: lanes('ff'),
        tags: { highway: 'secondary', junction: 'roundabout' },
      },
    ])
    expect(g.junctions).toHaveLength(0)
    const ring = g.lanes[0]!.ring
    // the lane starts where it ends
    expect(distance(ring[0]!, ring[ring.length / 2 - 1]!)).toBeLessThan(0.01)
  })
})

describe('streetGeometry: junctions', () => {
  const tJunction = () =>
    build({ a: [-100, 0], b: [0, 0], c: [100, 0], d: [0, 100] }, [
      {
        id: 'main1',
        nodes: ['a', 'b'],
        lanes: lanes('bbff'),
        tags: { highway: 'primary', name: 'Main' },
      },
      {
        id: 'main2',
        nodes: ['b', 'c'],
        lanes: lanes('bbff'),
        tags: { highway: 'primary', name: 'Main' },
      },
      { id: 'side', nodes: ['b', 'd'], lanes: lanes('bf'), tags: { highway: 'residential' } },
    ])

  it('a T-junction: the main road runs through, the side road stops at its kerb', () => {
    const g = tJunction()
    expect(g.junctions).toHaveLength(1)
    // the main road reaches the node
    expect(Math.min(...pointsOf(g, 'main1').map(([x]) => Math.abs(x)))).toBeLessThan(0.01)
    // the side road starts at the main road's kerb (6 m from its line), not before
    expect(Math.min(...pointsOf(g, 'side').map(([, y]) => y))).toBeGreaterThan(5.9)
    expect(selfIntersects(g.junctions[0]!.ring)).toBe(false)
  })

  it('a T-junction: the main road kerb stops at the mouth of the side road, its lane lines over the junction', () => {
    const g = tJunction()
    const kerbs = g.lines.filter((l) => l.wayId === 'main1' && l.kind === 'kerb')
    const north = kerbs.filter((l) => toMetres(l.line[0]!)[1] > 0)
    const south = kerbs.filter((l) => toMetres(l.line[0]!)[1] < 0)
    // north side (the side road's): stops before the node by about half the side road's width
    expect(Math.max(...north.flatMap((l) => l.line.map((p) => toMetres(p)[0])))).toBeLessThan(-2.5)
    // south side: runs to the node
    expect(Math.max(...south.flatMap((l) => l.line.map((p) => toMetres(p)[0])))).toBeGreaterThan(
      -0.01,
    )
  })

  it('a crossroads: one road runs through, the other stops at its kerbs, the outline is simple', () => {
    const g = build({ a: [-100, 0], b: [0, 0], c: [100, 0], d: [0, 100], e: [0, -100] }, [
      {
        id: 'we',
        nodes: ['a', 'b', 'c'],
        lanes: lanes('bf'),
        tags: { highway: 'primary', name: 'Main' },
      },
      {
        id: 'n',
        nodes: ['b', 'd'],
        lanes: lanes('bf'),
        tags: { highway: 'tertiary', name: 'Cross' },
      },
      {
        id: 's',
        nodes: ['b', 'e'],
        lanes: lanes('bf'),
        tags: { highway: 'tertiary', name: 'Cross' },
      },
    ])
    expect(g.junctions).toHaveLength(1)
    // the way through the node is cut into two pieces there, both reaching it
    expect(g.lanes.filter((l) => l.wayId === 'we')).toHaveLength(4)
    expect(Math.min(...pointsOf(g, 'n').map(([, y]) => y))).toBeGreaterThan(2.9)
    expect(Math.max(...pointsOf(g, 's').map(([, y]) => y))).toBeLessThan(-2.9)
    expect(selfIntersects(g.junctions[0]!.ring)).toBe(false)
  })

  it('a road splitting into two one-way roads: nothing runs through, every arm stops at the junction', () => {
    const g = build({ a: [-100, 0], b: [0, 0], c: [100, 20], d: [100, -20] }, [
      { id: 'stem', nodes: ['a', 'b'], lanes: lanes('bf') },
      {
        id: 'out',
        nodes: ['b', 'c'],
        lanes: lanes('f'),
        tags: { highway: 'secondary', oneway: 'yes' },
      },
      {
        id: 'in',
        nodes: ['d', 'b'],
        lanes: lanes('f'),
        tags: { highway: 'secondary', oneway: 'yes' },
      },
    ])
    expect(g.junctions).toHaveLength(1)
    expect(g.lanes.filter((l) => l.taper)).toHaveLength(0)
    expect(selfIntersects(g.junctions[0]!.ring)).toBe(false)
  })

  it('a roundabout: a road joining it stops outside the ring, not on its lanes', () => {
    // a ring of radius 25 m, two lanes (3 m each, the way in their middle), a two-lane road joining it from the east
    const nodes: Record<string, [number, number]> = {}
    const ring: string[] = []
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 2 * Math.PI
      nodes[`r${i}`] = [25 * Math.cos(a), 25 * Math.sin(a)]
      ring.push(`r${i}`)
    }
    nodes.e = [120, 0]
    const g = build(nodes, [
      {
        id: 'ring',
        nodes: [...ring, 'r0'],
        lanes: lanes('ff'),
        tags: { highway: 'primary', junction: 'roundabout' },
      },
      { id: 'side', nodes: ['r0', 'e'], lanes: lanes('bf'), tags: { highway: 'secondary' } },
    ])
    expect(g.junctions).toHaveLength(1)
    // the ring's outer edge is 28 m from its middle: the road's lanes start beyond it
    const nearest = Math.min(...pointsOf(g, 'side').map(([x, y]) => Math.hypot(x, y)))
    expect(nearest).toBeGreaterThan(28)
    expect(selfIntersects(g.junctions[0]!.ring)).toBe(false)
  })

  it('turn arrows sit near the end each lane runs to', () => {
    const turn = lanes('bf').map((lane) => ({
      ...lane,
      turn: lane.direction === 'forward' ? 'left;through' : 'right',
    }))
    const g = build({ a: [-100, 0], b: [0, 0] }, [{ id: 'w1', nodes: ['a', 'b'], lanes: turn }])
    const forward = g.arrows.find((a) => a.turn === 'left;through')!
    const backward = g.arrows.find((a) => a.turn === 'right')!
    expect(toMetres(forward.loc)[0]).toBeCloseTo(-12, 0)
    expect(forward.bearing).toBeCloseTo(90, 0)
    expect(toMetres(backward.loc)[0]).toBeCloseTo(-88, 0)
    expect(backward.bearing).toBeCloseTo(270, 0)
  })
})

describe('streetGeometry: junctions of several nodes close together', () => {
  /** Inside a ring given in [lon, lat] (even-odd) */
  const inside = (ring: [number, number][], x: number, y: number) => {
    const pts = ring.map(toMetres)
    let hit = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]!
      const [xj, yj] = pts[j]!
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
    }
    return hit
  }
  const xs = (g: StreetGeometry, wayId: string) => pointsOf(g, wayId).map(([x]) => x)
  const ys = (g: StreetGeometry, wayId: string) => pointsOf(g, wayId).map(([, y]) => y)

  // two carriageways 24 m apart (two lanes each, 6 m wide), crossed by a road of two lanes
  const dualCarriageway = () =>
    build(
      {
        sw: [-100, 0],
        s: [0, 0],
        se: [100, 0],
        ne: [100, 24],
        n: [0, 24],
        nw: [-100, 24],
        south: [0, -100],
        north: [0, 124],
      },
      [
        {
          id: 'east',
          nodes: ['sw', 's', 'se'],
          lanes: lanes('ff'),
          tags: { highway: 'primary', name: 'Avenue', oneway: 'yes' },
        },
        {
          id: 'west',
          nodes: ['ne', 'n', 'nw'],
          lanes: lanes('ff'),
          tags: { highway: 'primary', name: 'Avenue', oneway: 'yes' },
        },
        { id: 'cross1', nodes: ['south', 's'], lanes: lanes('bf'), tags: { name: 'Cross' } },
        { id: 'link', nodes: ['s', 'n'], lanes: lanes('bf'), tags: { name: 'Cross' } },
        { id: 'cross2', nodes: ['n', 'north'], lanes: lanes('bf'), tags: { name: 'Cross' } },
      ],
    )

  it('a dual carriageway crossed by a road: one junction for both nodes, simple, over the piece between them', () => {
    const g = dualCarriageway()
    expect(g.junctions).toHaveLength(1)
    const junction = g.junctions[0]!
    expect(junction.nodeIds).toEqual(['n', 's'])
    expect(junction.nodeId).toBe('n')
    expect(junction.holes).toBeUndefined()
    expect(selfIntersects(junction.ring)).toBe(false)
    // both nodes, the middle of the piece between them and its kerbs' side of the middle are on the surface
    for (const [x, y] of [
      [0, 0],
      [0, 24],
      [0, 12],
      [2.5, 12],
      [-2.5, 12],
    ] as const)
      expect(inside(junction.ring, x, y)).toBe(true)
    // the median beside the piece is not
    expect(inside(junction.ring, 6, 12)).toBe(false)
    expect(inside(junction.ring, -6, 12)).toBe(false)
  })

  it('a dual carriageway crossed by a road: the piece between is not drawn, the carriageways run through', () => {
    const g = dualCarriageway()
    expect(g.lanes.filter((l) => l.wayId === 'link')).toHaveLength(0)
    expect(g.lines.filter((l) => l.wayId === 'link')).toHaveLength(0)
    // each carriageway is cut at its node and both pieces reach it
    expect(g.lanes.filter((l) => l.wayId === 'east')).toHaveLength(4)
    expect(Math.min(...xs(g, 'east').map(Math.abs))).toBeLessThan(0.01)
    expect(Math.min(...xs(g, 'west').map(Math.abs))).toBeLessThan(0.01)
    // the crossing road stops at the outer kerbs (3 m from each carriageway's line)
    expect(Math.max(...ys(g, 'cross1'))).toBeCloseTo(-3, 1)
    expect(Math.min(...ys(g, 'cross2'))).toBeCloseTo(27, 1)
    // the carriageways' kerbs stop at the crossing road (3 m either side of its line) on both sides
    const kerbs = g.lines.filter((l) => l.wayId === 'east' && l.kind === 'kerb')
    for (const kerb of kerbs)
      for (const p of kerb.line) expect(Math.abs(toMetres(p)[0])).toBeGreaterThan(2.99)
  })

  // a main road of four lanes (12 m wide), a side street from the north at x = 0 and one from the south at x = 16
  const staggered = (gap = 16) =>
    build({ a: [-100, 0], b: [0, 0], c: [gap, 0], d: [100, 0], n: [0, 100], s: [gap, -100] }, [
      {
        id: 'main',
        nodes: ['a', 'b', 'c', 'd'],
        lanes: lanes('bbff'),
        tags: { highway: 'primary', name: 'Main' },
      },
      { id: 'north', nodes: ['b', 'n'], lanes: lanes('bf'), tags: { highway: 'residential' } },
      { id: 'south', nodes: ['c', 's'], lanes: lanes('bf'), tags: { highway: 'residential' } },
    ])

  it('a staggered junction: one junction from the first side street to the second', () => {
    const g = staggered()
    expect(g.junctions).toHaveLength(1)
    const junction = g.junctions[0]!
    expect(junction.nodeIds).toEqual(['b', 'c'])
    expect(selfIntersects(junction.ring)).toBe(false)
    // square across the main road at the outer kerb of each side street (3 m beyond its line)
    const ringX = junction.ring.map((p) => toMetres(p)[0])
    const ringY = junction.ring.map((p) => toMetres(p)[1])
    expect(Math.min(...ringX)).toBeCloseTo(-3, 1)
    expect(Math.max(...ringX)).toBeCloseTo(19, 1)
    expect(Math.min(...ringY)).toBeCloseTo(-6, 1)
    expect(Math.max(...ringY)).toBeCloseTo(6, 1)
    for (const [x, y] of [
      [-2, 5],
      [-2, -5],
      [8, 5],
      [8, -5],
      [18, 5],
      [18, -5],
    ] as const)
      expect(inside(junction.ring, x, y)).toBe(true)
  })

  it('a staggered junction: the main road keeps its lanes between the side streets, without lines', () => {
    const g = staggered()
    // three pieces of four lanes, meeting at the nodes
    expect(g.lanes.filter((l) => l.wayId === 'main')).toHaveLength(12)
    const between = g.lanes.filter(
      (l) =>
        l.wayId === 'main' && l.ring.every((p) => toMetres(p)[0] > -0.01 && toMetres(p)[0] < 16.01),
    )
    expect(between).toHaveLength(4)
    // no line of the main road over the junction, and its kerbs go on from the junction's kerbs
    for (const line of g.lines.filter((l) => l.wayId === 'main'))
      for (const p of line.line) {
        const [x] = toMetres(p)
        expect(x < -2.99 || x > 18.99).toBe(true)
      }
    // the side streets stop at the main road's kerbs
    expect(Math.min(...ys(g, 'north'))).toBeCloseTo(6, 1)
    expect(Math.max(...ys(g, 'south'))).toBeCloseTo(-6, 1)
    // the junction's kerbs close the main road's far side opposite each side street
    const kerbPoints = g.junctions[0]!.kerbs.flatMap((kerb) => kerb.map(toMetres))
    expect(kerbPoints.some(([x, y]) => Math.abs(x + 3) < 0.1 && Math.abs(y + 6) < 0.1)).toBe(true)
    expect(kerbPoints.some(([x, y]) => Math.abs(x - 19) < 0.1 && Math.abs(y - 6) < 0.1)).toBe(true)
  })

  it('side streets 40 m apart stay two junctions', () => {
    const g = staggered(40)
    expect(g.junctions).toHaveLength(2)
    expect(g.junctions.every((j) => j.nodeIds === undefined)).toBe(true)
  })

  it('short pieces round a block: one junction with the block as a hole', () => {
    // a square of 20 m with a road leaving each corner
    const g = build(
      {
        a: [0, 0],
        b: [20, 0],
        c: [20, 20],
        d: [0, 20],
        a2: [-80, -80],
        b2: [100, -80],
        c2: [100, 100],
        d2: [-80, 100],
      },
      [
        { id: 'square', nodes: ['a', 'b', 'c', 'd', 'a'], lanes: lanes('bf') },
        { id: 'ra', nodes: ['a', 'a2'], lanes: lanes('bf') },
        { id: 'rb', nodes: ['b', 'b2'], lanes: lanes('bf') },
        { id: 'rc', nodes: ['c', 'c2'], lanes: lanes('bf') },
        { id: 'rd', nodes: ['d', 'd2'], lanes: lanes('bf') },
      ],
    )
    expect(g.junctions).toHaveLength(1)
    const junction = g.junctions[0]!
    expect(junction.nodeIds).toEqual(['a', 'b', 'c', 'd'])
    expect(selfIntersects(junction.ring)).toBe(false)
    expect(junction.holes).toHaveLength(1)
    // the block between the square's inner kerbs (3 m in from its line) is the hole
    expect(inside(junction.holes![0]!, 10, 10)).toBe(true)
    expect(inside(junction.holes![0]!, 4, 4)).toBe(true)
    expect(inside(junction.holes![0]!, 2, 10)).toBe(false)
    expect(inside(junction.ring, 10, 10)).toBe(true)
    expect(inside(junction.ring, 10, -2)).toBe(true)
  })

  it('a roundabout ring is not joined along itself', () => {
    const nodes: Record<string, [number, number]> = {}
    const ring: string[] = []
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 2 * Math.PI
      nodes[`r${i}`] = [25 * Math.cos(a), 25 * Math.sin(a)]
      ring.push(`r${i}`)
    }
    // two roads joining the ring 13 m apart along it
    nodes.e = [120, 0]
    nodes.f = [120, 40]
    const g = build(nodes, [
      {
        id: 'ring',
        nodes: [...ring, 'r0'],
        lanes: lanes('ff'),
        tags: { highway: 'primary', junction: 'roundabout' },
      },
      { id: 'side1', nodes: ['r0', 'e'], lanes: lanes('bf') },
      { id: 'side2', nodes: ['r2', 'f'], lanes: lanes('bf') },
    ])
    expect(g.junctions).toHaveLength(2)
    expect(g.junctions.every((j) => j.nodeIds === undefined)).toBe(true)
  })
})

describe('streetGeometry: forks, slip roads and merges', () => {
  const oneWay = { highway: 'primary', oneway: 'yes' }
  /** The y at which a lane's outline is at the node (x = 0): its two corners there */
  const atNode = (g: StreetGeometry, wayId: string, laneId: string) =>
    g.lanes
      .find((l) => l.wayId === wayId && l.laneId === laneId)!
      .ring.map(toMetres)
      .filter(([x]) => Math.abs(x) < 0.01)
      .map(([, y]) => y)
      .sort((a, b) => a - b)

  it('a slip road leaves (as L19): it starts on the right lane, the through lanes on theirs, no box', () => {
    // three lanes become two, a one-lane link leaves to the right at about 11°
    const g = build({ a: [-100, 0], b: [0, 0], c: [100, 0], d: [70, -14], e: [140, -45] }, [
      { id: 'stem', nodes: ['a', 'b'], lanes: lanes('fff'), tags: oneWay },
      { id: 'main', nodes: ['b', 'c'], lanes: lanes('ff'), tags: oneWay },
      {
        id: 'slip',
        nodes: ['b', 'd', 'e'],
        lanes: lanes('f'),
        tags: { highway: 'primary_link', oneway: 'yes' },
      },
    ])
    // the stem's lanes: 4.5 to 1.5, 1.5 to -1.5, -1.5 to -4.5 (north is left of a road going east)
    expect(atNode(g, 'slip', 'f0')).toEqual([expect.closeTo(-4.5, 2), expect.closeTo(-1.5, 2)])
    expect(atNode(g, 'main', 'f0')).toEqual([expect.closeTo(1.5, 2), expect.closeTo(4.5, 2)])
    expect(atNode(g, 'main', 'f1')).toEqual([expect.closeTo(-1.5, 2), expect.closeTo(1.5, 2)])
    expect(g.lanes.filter((l) => l.taper)).toHaveLength(0)
    // further on each road is where its way is
    const far = pointsOf(g, 'main').filter(([x]) => x > 60)
    expect(Math.max(...far.map(([, y]) => y))).toBeCloseTo(3, 2)
    expect(Math.min(...far.map(([, y]) => y))).toBeCloseTo(-3, 2)
    // only the wedge between the two roads is the fork's surface: it starts at the node and lies off the through lanes
    expect(g.junctions).toHaveLength(1)
    const wedge = g.junctions[0]!.ring.map(toMetres)
    expect(selfIntersects(g.junctions[0]!.ring)).toBe(false)
    expect(Math.min(...wedge.map(([x]) => x))).toBeCloseTo(0, 2)
    expect(Math.max(...wedge.map(([, y]) => y))).toBeLessThan(-1.4)
    expect(Math.min(...wedge.map(([, y]) => y))).toBeGreaterThan(-9)
    for (const lane of g.lanes) expect(selfIntersects(lane.ring)).toBe(false)
  })

  it('a slip road with no lane of its own on the stem peels off the outer lane, the main road is unchanged', () => {
    const g = build({ a: [-100, 0], b: [0, 0], c: [100, 0], d: [70, -14] }, [
      { id: 'main', nodes: ['a', 'b', 'c'], lanes: lanes('ff'), tags: oneWay },
      {
        id: 'slip',
        nodes: ['b', 'd'],
        lanes: lanes('f'),
        tags: { highway: 'primary_link', oneway: 'yes' },
      },
    ])
    expect(atNode(g, 'slip', 'f0')).toEqual([expect.closeTo(-3, 2), expect.closeTo(0, 2)])
    const ys = pointsOf(g, 'main').map(([, y]) => y)
    expect(Math.max(...ys)).toBeCloseTo(3, 2)
    expect(Math.min(...ys)).toBeCloseTo(-3, 2)
    expect(g.junctions).toHaveLength(0)
    // the main road's kerb on the slip road's side is open at the mouth and starts again beyond it
    const south = g.lines
      .filter((l) => l.wayId === 'main' && l.kind === 'kerb')
      .map((l) => l.line.map(toMetres))
      .filter((line) => line.every(([x, y]) => x > 0.01 && y < -2.9))
    expect(south).toHaveLength(1)
    expect(Math.min(...south[0]!.map(([x]) => x))).toBeGreaterThan(5)
  })

  it('two one-way roads join (as L20): each runs into its side of the joined road, its kerbs run on', () => {
    const g = build({ a: [-80, 13], b: [-80, -13], c: [0, 0], d: [100, 0] }, [
      { id: 'north', nodes: ['a', 'c'], lanes: lanes('f'), tags: oneWay },
      { id: 'south', nodes: ['b', 'c'], lanes: lanes('f'), tags: oneWay },
      { id: 'joined', nodes: ['c', 'd'], lanes: lanes('ff'), tags: oneWay },
    ])
    expect(atNode(g, 'north', 'f0')).toEqual([expect.closeTo(0, 2), expect.closeTo(3, 2)])
    expect(atNode(g, 'south', 'f0')).toEqual([expect.closeTo(-3, 2), expect.closeTo(0, 2)])
    expect(g.lanes.filter((l) => l.taper)).toHaveLength(0)
    // the joined road is untouched, and a kerb of each branch ends on its kerb
    const ys = pointsOf(g, 'joined').map(([, y]) => y)
    expect(Math.max(...ys)).toBeCloseTo(3, 2)
    expect(Math.min(...ys)).toBeCloseTo(-3, 2)
    const kerbEnds = (wayId: string) =>
      g.lines
        .filter((l) => l.wayId === wayId && l.kind === 'kerb')
        .flatMap((l) => [l.line[0]!, l.line[l.line.length - 1]!].map(toMetres))
    expect(kerbEnds('north').some(([x, y]) => Math.hypot(x, y - 3) < 0.01)).toBe(true)
    expect(kerbEnds('south').some(([x, y]) => Math.hypot(x, y + 3) < 0.01)).toBe(true)
    expect(g.junctions).toHaveLength(1)
    expect(selfIntersects(g.junctions[0]!.ring)).toBe(false)
  })

  it('a road parts into its two carriageways (as L11): each takes the lanes of its direction, a wedge opens between', () => {
    // traffic keeps right: the eastbound carriageway is the southern one
    const g = build(
      { a: [-100, 0], b: [0, 0], c: [60, -14], d: [140, -14], e: [140, 14], f: [60, 14] },
      [
        { id: 'stem', nodes: ['a', 'b'], lanes: lanes('bbff') },
        { id: 'east', nodes: ['b', 'c', 'd'], lanes: lanes('ff'), tags: oneWay },
        { id: 'west', nodes: ['e', 'f', 'b'], lanes: lanes('ff'), tags: oneWay },
      ],
    )
    expect(atNode(g, 'east', 'f0')).toEqual([expect.closeTo(-3, 2), expect.closeTo(0, 2)])
    expect(atNode(g, 'east', 'f1')).toEqual([expect.closeTo(-6, 2), expect.closeTo(-3, 2)])
    // (the westbound way runs towards the node: its left lane is the southern one)
    expect(atNode(g, 'west', 'f0')).toEqual([expect.closeTo(0, 2), expect.closeTo(3, 2)])
    expect(atNode(g, 'west', 'f1')).toEqual([expect.closeTo(3, 2), expect.closeTo(6, 2)])
    expect(g.lanes.filter((l) => l.taper)).toHaveLength(0)
    expect(g.junctions).toHaveLength(1)
    const wedge = g.junctions[0]!.ring.map(toMetres)
    expect(selfIntersects(g.junctions[0]!.ring)).toBe(false)
    expect(Math.max(...wedge.map(([, y]) => Math.abs(y)))).toBeLessThan(2)
    expect(Math.max(...wedge.map(([x]) => x))).toBeLessThan(40)
    for (const lane of g.lanes) expect(selfIntersects(lane.ring)).toBe(false)
  })

  it('no fork where traffic would cross, at a wide angle, or just before a junction', () => {
    // the one-way road leaving on the left of a two-way road that runs on crosses the oncoming lanes
    const crossing = build({ a: [-100, 0], b: [0, 0], c: [100, 0], d: [80, 20] }, [
      { id: 'main', nodes: ['a', 'b', 'c'], lanes: lanes('bf') },
      { id: 'left', nodes: ['b', 'd'], lanes: lanes('f'), tags: oneWay },
    ])
    expect(crossing.lines.filter((l) => l.wayId === 'main' && l.kind === 'centre')).toHaveLength(2)
    expect(Math.min(...pointsOf(crossing, 'left').map(([x]) => x))).toBeGreaterThan(3)
    // a side street at 60°
    const wide = build({ a: [-100, 0], b: [0, 0], c: [100, 0], d: [40, -70] }, [
      { id: 'main', nodes: ['a', 'b', 'c'], lanes: lanes('ff'), tags: oneWay },
      { id: 'side', nodes: ['b', 'd'], lanes: lanes('f'), tags: oneWay },
    ])
    expect(Math.max(...pointsOf(wide, 'side').map(([, y]) => y))).toBeLessThan(-2.9)
    // a slip road 15 m before a crossroads belongs to that junction
    const close = build(
      { a: [-100, 0], b: [0, 0], c: [15, 0], d: [100, 0], e: [70, -14], n: [15, 60], s: [15, -3] },
      [
        { id: 'main', nodes: ['a', 'b', 'c', 'd'], lanes: lanes('ff'), tags: oneWay },
        { id: 'slip', nodes: ['b', 'e'], lanes: lanes('f'), tags: oneWay },
        { id: 'cross', nodes: ['n', 'c', 's'], lanes: lanes('bf') },
      ],
    )
    expect(close.junctions).toHaveLength(1)
    expect(close.junctions[0]!.nodeIds).toEqual(['b', 'c'])
  })
})

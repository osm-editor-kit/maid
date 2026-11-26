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
const toMetres = (loc: readonly [number, number]): [number, number] => [(loc[0] - ORIGIN[0]) * KX, (loc[1] - ORIGIN[1]) * KY]

function lanes(spec: string, width = 3): StreetLane[] {
  // `b` backward, `f` forward, `x` both ways; left to right, the way's line in the middle of the road
  const total = spec.length * width
  return [...spec].map((c, i) => ({
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
  geometry.lanes.filter((lane) => lane.wayId === wayId && !lane.taper).flatMap((lane) => lane.ring.map(toMetres))

function segmentsCross(a: number[], b: number[], c: number[], d: number[]) {
  const o = (p: number[], q: number[], r: number[]) => Math.sign((q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!))
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}

function selfIntersects(ring: [number, number][]) {
  const pts = ring.map(toMetres)
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 2; j < pts.length; j++) {
      if (i === 0 && j === pts.length - 1) continue
      if (segmentsCross(pts[i]!, pts[(i + 1) % pts.length]!, pts[j]!, pts[(j + 1) % pts.length]!)) return true
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
    for (const p of atNode('w1')) expect(atNode('w2').some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01)).toBe(true)
  })

  it('a bend is cut on its bisector, so the lanes meet without a gap', () => {
    const g = build({ a: [-100, 0], b: [0, 0], c: [70, 70] }, [
      { id: 'w1', nodes: ['a', 'b'], lanes: lanes('bf') },
      { id: 'w2', nodes: ['b', 'c'], lanes: lanes('bf') },
    ])
    const ends = g.lanes.filter((l) => l.wayId === 'w1').flatMap((l) => [l.ring[1]!, l.ring[2]!])
    const starts = g.lanes.filter((l) => l.wayId === 'w2').flatMap((l) => [l.ring[0]!, l.ring[l.ring.length - 1]!])
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
      { id: 'w1', nodes: ['a', 'b'], lanes: lanes('ff'), tags: { highway: 'secondary', oneway: 'yes' } },
      { id: 'w2', nodes: ['b', 'c'], lanes: lanes('fff'), tags: { highway: 'secondary', oneway: 'yes' } },
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
    const back = pointsOf(g, 'w1').filter(([x]) => x < -30).map(([, y]) => y)
    expect(Math.max(...back) - Math.min(...back)).toBeCloseTo(6, 1)
  })

  it('a carriageway without lanes widens to the kerbs of a road with lanes, without tapers', () => {
    const g = build({ a: [-100, 0], b: [0, 0], c: [100, 0] }, [
      { id: 'w1', nodes: ['a', 'b'], lanes: lanes('x', 5) },
      { id: 'w2', nodes: ['b', 'c'], lanes: lanes('bbff') },
    ])
    expect(g.lanes.filter((l) => l.taper)).toHaveLength(0)
    const ys = pointsOf(g, 'w1').filter(([x]) => Math.abs(x) < 0.01).map(([, y]) => y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(12, 1)
  })

  it('a closed way (a ring) meets itself', () => {
    const g = build({ a: [0, -30], b: [30, 0], c: [0, 30], d: [-30, 0] }, [
      { id: 'w1', nodes: ['a', 'b', 'c', 'd', 'a'], lanes: lanes('ff'), tags: { highway: 'secondary', junction: 'roundabout' } },
    ])
    expect(g.junctions).toHaveLength(0)
    const ring = g.lanes[0]!.ring
    // the lane starts where it ends
    expect(distance(ring[0]!, ring[(ring.length / 2) - 1]!)).toBeLessThan(0.01)
  })
})

describe('streetGeometry: junctions', () => {
  const tJunction = () =>
    build({ a: [-100, 0], b: [0, 0], c: [100, 0], d: [0, 100] }, [
      { id: 'main1', nodes: ['a', 'b'], lanes: lanes('bbff'), tags: { highway: 'primary', name: 'Main' } },
      { id: 'main2', nodes: ['b', 'c'], lanes: lanes('bbff'), tags: { highway: 'primary', name: 'Main' } },
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
    expect(Math.max(...south.flatMap((l) => l.line.map((p) => toMetres(p)[0])))).toBeGreaterThan(-0.01)
  })

  it('a crossroads: one road runs through, the other stops at its kerbs, the outline is simple', () => {
    const g = build({ a: [-100, 0], b: [0, 0], c: [100, 0], d: [0, 100], e: [0, -100] }, [
      { id: 'we', nodes: ['a', 'b', 'c'], lanes: lanes('bf'), tags: { highway: 'primary', name: 'Main' } },
      { id: 'n', nodes: ['b', 'd'], lanes: lanes('bf'), tags: { highway: 'tertiary', name: 'Cross' } },
      { id: 's', nodes: ['b', 'e'], lanes: lanes('bf'), tags: { highway: 'tertiary', name: 'Cross' } },
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
      { id: 'out', nodes: ['b', 'c'], lanes: lanes('f'), tags: { highway: 'secondary', oneway: 'yes' } },
      { id: 'in', nodes: ['d', 'b'], lanes: lanes('f'), tags: { highway: 'secondary', oneway: 'yes' } },
    ])
    expect(g.junctions).toHaveLength(1)
    expect(g.lanes.filter((l) => l.taper)).toHaveLength(0)
    expect(selfIntersects(g.junctions[0]!.ring)).toBe(false)
  })

  it('turn arrows sit near the end each lane runs to', () => {
    const turn = lanes('bf').map((lane) => ({ ...lane, turn: lane.direction === 'forward' ? 'left;through' : 'right' }))
    const g = build({ a: [-100, 0], b: [0, 0] }, [{ id: 'w1', nodes: ['a', 'b'], lanes: turn }])
    const forward = g.arrows.find((a) => a.turn === 'left;through')!
    const backward = g.arrows.find((a) => a.turn === 'right')!
    expect(toMetres(forward.loc)[0]).toBeCloseTo(-12, 0)
    expect(forward.bearing).toBeCloseTo(90, 0)
    expect(toMetres(backward.loc)[0]).toBeCloseTo(-88, 0)
    expect(backward.bearing).toBeCloseTo(270, 0)
  })
})

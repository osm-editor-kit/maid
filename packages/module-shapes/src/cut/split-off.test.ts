import { describe, expect, it } from 'bun:test'
import { Graph, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import { splitOffPlan, splitOffPreview, type Loc } from './cut.ts'
import { at, graphOf, node, relation, square, way } from './test-graph.ts'

// The origin of test-graph's positions, and the same metre scale, to measure areas in metres
const LON0 = 13.4
const LAT0 = 52.5
const DEGREE = (Math.PI * 6378137) / 180
const KX = DEGREE * Math.cos((LAT0 * Math.PI) / 180)
const KY = DEGREE

/** Tags of the room in every test */
const ROOM_TAGS = { indoor: 'room', level: '0' }
/** The nodes of the 10 m square before any split */
const BASE_IDS = ['n0', 'n1', 'n2', 'n3']

/** A position in metres from the test origin */
function metresOf(loc: Loc): { x: number; y: number } {
  return { x: (loc[0] - LON0) * KX, y: (loc[1] - LAT0) * KY }
}

/** Area of a ring of positions in square metres (shoelace) */
function areaOfLocs(locs: Loc[]): number {
  const pts = locs.map(metresOf)
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    sum += a.x * b.y - a.y * b.x
  }
  return Math.abs(sum) / 2
}

/** Area of a closed way in square metres */
function areaOf(graph: Graph, wayId: string): number {
  const way = graph.entity(wayId) as OsmWay
  return areaOfLocs(way.nodes.slice(0, -1).map((id) => (graph.entity(id) as OsmNode).loc!))
}

/** The distinct nodes of a closed way, without the closing repeat */
function nodesOf(graph: Graph, wayId: string): string[] {
  return [...new Set((graph.entity(wayId) as OsmWay).nodes.slice(0, -1))]
}

/** Plans and applies a split-off, as the editor does: the action runs on a copy of the head graph */
function split(
  base: Graph,
  line: Loc[],
  tags: Record<string, string> = ROOM_TAGS,
  wayId = 'w1',
): { after: Graph; roomId: string; ring: Loc[] } {
  const plan = splitOffPlan(base, wayId, line, tags)
  if ('refused' in plan) throw new Error(`refused: ${plan.refused}`)
  const after = plan.action(new Graph(base))
  return { after, roomId: plan.roomId, ring: plan.ring }
}

describe('split off: a room drawn into a building', () => {
  it('cuts a corner room off the building, which keeps its tags and shape', () => {
    const base = graphOf(...square())
    const { after, roomId, ring } = split(base, [at(4, 0), at(4, 4), at(10, 4)])
    const room = after.entity(roomId) as OsmWay
    expect(room).toBeInstanceOf(OsmWay)
    expect(room.nodes[0]).toBe(room.nodes[room.nodes.length - 1])
    // Measured: the corner room is the quadrilateral (4,0) (10,0) (10,4) (4,4), so 4 distinct nodes
    // (the task brief said 5, which does not match the geometry)
    const roomIds = nodesOf(after, roomId)
    expect(roomIds).toHaveLength(4)
    expect(roomIds).toContain('n1')
    expect(room.tags).toEqual(ROOM_TAGS)
    expect(areaOf(after, roomId)).toBeCloseTo(24, 3)
    expect(ring).toHaveLength(5)

    const building = after.entity('w1') as OsmWay
    expect(building.tags).toEqual({ building: 'yes' })
    expect(nodesOf(after, 'w1')).toHaveLength(6)
    expect(areaOf(after, 'w1')).toBeCloseTo(100, 3)
    // The two crossings are on the building's outline too, so the room shares them with it
    const shared = roomIds.filter((id) => building.nodes.includes(id))
    expect(shared).toHaveLength(3)
    // The one chord point is new and not on the outline; the crossings are new nodes as well
    const inside = roomIds.filter((id) => !building.nodes.includes(id))
    expect(inside).toHaveLength(1)
    expect(inside[0]!.startsWith('n-')).toBe(true)
    const chordAt = metresOf((after.entity(inside[0]!) as OsmNode).loc!)
    expect(chordAt.x).toBeCloseTo(4, 6)
    expect(chordAt.y).toBeCloseTo(4, 6)
  })

  it('cuts a straight line across the building into a bottom piece of 30 m2', () => {
    const base = graphOf(...square())
    const { after, roomId } = split(base, [at(0, 3), at(10, 3)])
    const room = after.entity(roomId) as OsmWay
    expect(room.tags).toEqual(ROOM_TAGS)
    expect(nodesOf(after, roomId)).toHaveLength(4)
    expect(nodesOf(after, roomId)).toEqual(expect.arrayContaining(['n0', 'n1']))
    expect(areaOf(after, roomId)).toBeCloseTo(30, 3)
    expect(areaOf(after, 'w1')).toBeCloseTo(100, 3)
    expect((after.entity('w1') as OsmWay).tags).toEqual({ building: 'yes' })
  })

  it('takes the smaller piece even when it is the other side of the line', () => {
    const base = graphOf(...square())
    // The chord runs from the bottom edge to the left edge: the piece with the top right corner is 36 m2
    const { after, roomId } = split(base, [at(8, 0), at(8, 8), at(0, 8)])
    const nodes = nodesOf(after, roomId)
    expect(nodes).toHaveLength(6)
    expect(nodes).toEqual(expect.arrayContaining(['n1', 'n2', 'n3']))
    expect(areaOf(after, roomId)).toBeCloseTo(36, 3)
  })

  it('reuses the vertex at the end of the line, adding no node there', () => {
    const base = graphOf(...square())
    // The line ends exactly on the corner n2 (10, 10)
    const { after, roomId } = split(base, [at(5, 0), at(5, 5), at(10, 10)])
    const roomIds = nodesOf(after, roomId)
    expect(roomIds).toHaveLength(4)
    expect(roomIds).toContain('n2')
    // Only the crossing on the bottom edge and the chord point are new
    expect(roomIds.filter((id) => !BASE_IDS.includes(id))).toHaveLength(2)
    expect(nodesOf(after, 'w1')).toHaveLength(5)
    expect(areaOf(after, roomId)).toBeCloseTo(37.5, 3)
    expect(areaOf(after, 'w1')).toBeCloseTo(100, 3)
  })

  it('is refused when the end of the line lies inside the building', () => {
    const base = graphOf(...square())
    expect(splitOffPlan(base, 'w1', [at(4, 0), at(4, 4), at(8, 4)], ROOM_TAGS)).toEqual({
      refused: 'crossings',
    })
  })

  it('is refused when the middle of the line leaves the building', () => {
    const base = graphOf(...square())
    // Out through the right edge at (10, 4), back in at (10, 5.7), out again at the top edge and in
    // the end on the top edge: four crossings instead of two
    expect(splitOffPlan(base, 'w1', [at(4, 0), at(4, 4), at(12, 4), at(5, 10)], ROOM_TAGS)).toEqual(
      { refused: 'crossings' },
    )
  })

  it('is refused when fewer than two distinct points are drawn', () => {
    const base = graphOf(...square())
    expect(splitOffPlan(base, 'w1', [at(4, 0), at(4, 0)], ROOM_TAGS)).toEqual({
      refused: 'crossings',
    })
  })

  it('previews the same ring as the plan, and creates no ids', () => {
    const base = graphOf(...square())
    const line = [at(4, 0), at(4, 4), at(10, 4)]
    const before = { ...base.context.sequences }
    const preview = splitOffPreview(base, 'w1', line)
    expect(base.context.sequences).toEqual(before)
    const plan = splitOffPlan(base, 'w1', line, ROOM_TAGS)
    if ('refused' in plan) throw new Error(`refused: ${plan.refused}`)
    expect(preview).toEqual({ ring: plan.ring })
  })

  it('adds the room to a multipolygon without changing the relation', () => {
    const base = graphOf(
      ...square({}),
      relation('r1', { type: 'multipolygon', building: 'yes' }, [
        { id: 'w1', type: 'way', role: 'outer' },
      ]),
    )
    const { after, roomId } = split(base, [at(4, 0), at(4, 4), at(10, 4)])
    expect(after.entity(roomId)).toBeInstanceOf(OsmWay)
    expect(areaOf(after, roomId)).toBeCloseTo(24, 3)
    const rel = after.entity('r1') as OsmRelation
    expect(rel.members.map((m) => [m.id, m.role])).toEqual([['w1', 'outer']])
    expect((after.entity('w1') as OsmWay).tags).toEqual({})
  })

  it('refuses a room that would cover a hole of the building (a courtyard)', () => {
    const base = graphOf(
      ...square({}),
      node('h0', 1, 1),
      node('h1', 3, 1),
      node('h2', 3, 3),
      node('h3', 1, 3),
      way('h', ['h0', 'h1', 'h2', 'h3', 'h0']),
      relation('r1', { type: 'multipolygon', building: 'yes' }, [
        { id: 'w1', type: 'way', role: 'outer' },
        { id: 'h', type: 'way', role: 'inner' },
      ]),
    )
    const line = [at(0, 5), at(5, 5), at(5, 0)]
    expect(splitOffPlan(base, 'w1', line, { indoor: 'room' })).toEqual({ refused: 'through_hole' })
    expect(splitOffPreview(base, 'w1', line)).toEqual({ refused: 'through_hole' })
  })
})

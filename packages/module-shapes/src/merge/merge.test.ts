import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { mergePlan } from './merge.ts'
import type { MergeRefusal } from './merge.ts'

const context = new ModelContext()

// The test origin is near lon 13.4, lat 52.5. Coordinates are given in metres east and north of it.
const LON0 = 13.4
const LAT0 = 52.5
const PER_DEGREE = (Math.PI / 180) * 6371008.8
const METRES_PER_LON = PER_DEGREE * Math.cos((LAT0 * Math.PI) / 180)
const METRES_PER_LAT = PER_DEGREE

type Pt = [number, number]

/** The location [lon, lat] of a place given in metres */
function at(east: number, north: number): [number, number] {
  return [LON0 + east / METRES_PER_LON, LAT0 + north / METRES_PER_LAT]
}

/** A place in the graph, in metres */
function metresOf(node: OsmNode): Pt {
  const loc = node.loc!
  return [(loc[0] - LON0) * METRES_PER_LON, (loc[1] - LAT0) * METRES_PER_LAT]
}

function node(id: string, east: number, north: number, tags: Record<string, string> = {}): OsmNode {
  return new OsmNode(context, { id, loc: at(east, north), tags })
}

/** A way through the given nodes, as they are */
function way(id: string, nodes: string[], tags: Record<string, string> = {}): OsmWay {
  return new OsmWay(context, { id, nodes, tags })
}

/** A closed way: the first node repeated at the end, as OSM stores it */
function ring(id: string, nodes: string[], tags: Record<string, string> = {}): OsmWay {
  return way(id, [...nodes, ...nodes.slice(0, 1)], tags)
}

/** The four corner nodes of a square, named `n<prefix>1` to `n<prefix>4` */
function square(prefix: string, x: number, y: number, size: number): OsmNode[] {
  return [
    node(`n${prefix}1`, x, y),
    node(`n${prefix}2`, x + size, y),
    node(`n${prefix}3`, x + size, y + size),
    node(`n${prefix}4`, x, y + size),
  ]
}

/** Node ids of a circle of `count` nodes, radius 100 m, centred `centre` metres east */
function circleIDs(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, k) => `n${prefix}${k}`)
}

/** The nodes of a circle of `count` nodes, radius 100 m, centred `centre` metres east */
function circleNodes(prefix: string, count: number, centre: number): OsmNode[] {
  return Array.from({ length: count }, (_, k) => {
    const angle = (2 * Math.PI * k) / count
    return node(`n${prefix}${k}`, centre + 100 * Math.cos(angle), 100 * Math.sin(angle))
  })
}

/** Distance in metres between two points */
function distance(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function graphOf(...entities: OsmEntity[]): Graph {
  return new Graph(context, entities)
}

/** Ten-metre square `w1` at the origin and `w2` offset by (dx, dy), as two closed ways */
function twoSquares(dx: number, dy: number, size = 10): OsmEntity[] {
  return [
    ...square('a', 0, 0, size),
    ...square('b', dx, dy, size),
    ring('w1', ['na1', 'na2', 'na3', 'na4']),
    ring('w2', ['nb1', 'nb2', 'nb3', 'nb4']),
  ]
}

/** The L-shape graph: 10 m square `w1` and 10 m square `w2` offset by 7 m in both directions */
function lShape(): Graph {
  return graphOf(...twoSquares(7, 7))
}

/** The outline of a way in metres, without the closing node */
function outlineOf(graph: Graph, id: string): Pt[] {
  const nodes = (graph.entity(id) as OsmWay).nodes.slice(0, -1)
  return nodes.map((nodeID) => metresOf(graph.entity(nodeID) as OsmNode))
}

/** Signed area of a polygon in square metres: positive when counter-clockwise */
function signedAreaOf(pts: Pt[]): number {
  let sum = 0
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length] as Pt
    sum += a[0] * b[1] - b[0] * a[1]
  })
  return sum / 2
}

/** Area of a polygon in square metres */
function areaOf(pts: Pt[]): number {
  return Math.abs(signedAreaOf(pts))
}

/** Node ids of a closed way in `after` that are not in `before` (the closing node is not counted twice) */
function newNodeIDs(before: Graph, after: Graph, id: string): string[] {
  return (after.entity(id) as OsmWay).nodes
    .slice(0, -1)
    .filter((nodeID) => !before.hasEntity(nodeID))
}

/** Plans and applies the merge, as the editor does. Throws if the merge is refused. */
function mergeOf(base: Graph, ids: string[]): Graph {
  const plan = mergePlan(new Graph(base), ids)
  if ('refused' in plan) throw new Error(`refused: ${plan.refused}`)
  return plan.action(new Graph(base))
}

/** The refusal for the two ways, or 'merged' */
function outcomeOf(base: Graph, ids: string[]): MergeRefusal | 'merged' {
  const plan = mergePlan(new Graph(base), ids)
  return 'refused' in plan ? plan.refused : 'merged'
}

describe('merge areas: two overlapping areas', () => {
  it('two 10 m squares that overlap by 3 m both ways give one L-shaped outline with 2 new nodes', () => {
    const base = lShape()
    const result = mergeOf(base, ['w1', 'w2'])

    expect(result.hasEntity('w2')).toBeUndefined()
    const outline = outlineOf(result, 'w1')
    expect(outline.length).toBe(8)
    expect(areaOf(outline)).toBeCloseTo(191, 6)

    const added = newNodeIDs(base, result, 'w1').map((id) => metresOf(result.entity(id) as OsmNode))
    expect(added.length).toBe(2)
    for (const expected of [
      [10, 7],
      [7, 10],
    ] as Pt[]) {
      expect(
        added.some(
          (pt) => Math.abs(pt[0] - expected[0]) < 1e-6 && Math.abs(pt[1] - expected[1]) < 1e-6,
        ),
      ).toBe(true)
    }
  })

  it('every new node on the outline is a corner, not a point on a straight stretch', () => {
    const base = lShape()
    const result = mergeOf(base, ['w1', 'w2'])
    const nodes = (result.entity('w1') as OsmWay).nodes.slice(0, -1)
    const pts = nodes.map((id) => metresOf(result.entity(id) as OsmNode))

    nodes.forEach((id, i) => {
      if (!base.hasEntity(id)) {
        const prev = pts[(i + nodes.length - 1) % nodes.length] as Pt
        const next = pts[(i + 1) % nodes.length] as Pt
        const cur = pts[i] as Pt
        const turn =
          (cur[0] - prev[0]) * (next[1] - cur[1]) - (cur[1] - prev[1]) * (next[0] - cur[0])
        expect(Math.abs(turn)).toBeGreaterThan(1e-3)
      }
    })
  })

  it('the existing nodes that stay on the outline keep their ids and exact locations; the others are deleted', () => {
    const base = lShape()
    const result = mergeOf(base, ['w1', 'w2'])
    const nodes = (result.entity('w1') as OsmWay).nodes.slice(0, -1)

    for (const id of nodes) {
      if (base.hasEntity(id))
        expect((result.entity(id) as OsmNode).loc).toEqual((base.entity(id) as OsmNode).loc)
    }
    // (7,7) is inside the first square, (10,10) inside the second
    expect(result.hasEntity('nb1')).toBeUndefined()
    expect(result.hasEntity('na3')).toBeUndefined()
  })

  it('a 5 cm overlap still merges: there is no area threshold yet (research, open question 1)', () => {
    const base = graphOf(...twoSquares(9.95, 0))
    const result = mergeOf(base, ['w1', 'w2'])
    expect(areaOf(outlineOf(result, 'w1'))).toBeCloseTo(199.5, 6)
  })

  it('two rectangles offset in one direction merge along their common edges, with no new nodes', () => {
    const base = graphOf(...twoSquares(7, 0))
    const result = mergeOf(base, ['w1', 'w2'])
    expect(areaOf(outlineOf(result, 'w1'))).toBeCloseTo(170, 6)
    expect(newNodeIDs(base, result, 'w1').length).toBe(0)
    // only the four corners stay; the straight nodes at 7 m and 10 m are removed
    expect((result.entity('w1') as OsmWay).nodes.slice(0, -1).length).toBe(4)
    for (const id of ['na2', 'nb1', 'na3', 'nb4']) expect(result.hasEntity(id)).toBeUndefined()
  })

  it('a straight node that another way uses stays on the outline', () => {
    // nb4 (7,10) lies on the top edge of the merged outline, but w9 uses it
    const base = graphOf(...twoSquares(7, 0), node('nx', 40, 40), way('w9', ['nb4', 'nx']))
    const result = mergeOf(base, ['w1', 'w2'])
    const nodes = (result.entity('w1') as OsmWay).nodes.slice(0, -1)
    expect(nodes.length).toBe(5)
    expect(nodes).toContain('nb4')
  })

  it('a straight node that carries tags stays on the outline', () => {
    const base = graphOf(
      ...square('a', 0, 0, 10),
      node('nb1', 7, 0),
      node('nb2', 17, 0),
      node('nb3', 17, 10),
      node('nb4', 7, 10, { name: 'Hof' }),
      ring('w1', ['na1', 'na2', 'na3', 'na4']),
      ring('w2', ['nb1', 'nb2', 'nb3', 'nb4']),
    )
    const result = mergeOf(base, ['w1', 'w2'])
    const nodes = (result.entity('w1') as OsmWay).nodes.slice(0, -1)
    expect(nodes.length).toBe(5)
    expect(nodes).toContain('nb4')
  })

  it('an area inside another without touching is refused as contained', () => {
    const base = graphOf(
      ...square('a', 0, 0, 20),
      ...square('b', 5, 5, 5),
      ring('w1', ['na1', 'na2', 'na3', 'na4']),
      ring('w2', ['nb1', 'nb2', 'nb3', 'nb4']),
    )
    expect(outcomeOf(base, ['w1', 'w2'])).toBe('contained')
  })

  it('areas that meet only at a corner, or not at all, are refused as not_touching', () => {
    const corner = graphOf(...twoSquares(10, 10))
    expect(outcomeOf(corner, ['w1', 'w2'])).toBe('not_touching')

    const apart = graphOf(...twoSquares(30, 0))
    expect(outcomeOf(apart, ['w1', 'w2'])).toBe('not_touching')
  })

  it('areas that touch along an edge but share no node are refused as not_touching', () => {
    // Same places as a shared wall, but the second area has its own nodes
    const base = graphOf(
      ...square('a', 0, 0, 10),
      ...square('b', 10, 0, 10),
      ring('w1', ['na1', 'na2', 'na3', 'na4']),
      ring('w2', ['nb1', 'nb2', 'nb3', 'nb4']),
    )
    expect(outcomeOf(base, ['w1', 'w2'])).toBe('not_touching')
  })

  it('row houses sharing a wall merge into one outline; the wall node in the middle is deleted', () => {
    const base = graphOf(
      node('na1', 0, 0),
      node('na2', 10, 0),
      node('na3', 10, 5),
      node('na4', 10, 10),
      node('na5', 0, 10),
      node('nb1', 20, 0),
      node('nb2', 20, 10),
      ring('w1', ['na1', 'na2', 'na3', 'na4', 'na5']),
      ring('w2', ['na2', 'nb1', 'nb2', 'na4', 'na3']),
    )
    const result = mergeOf(base, ['w1', 'w2'])

    const outlineIDs = (result.entity('w1') as OsmWay).nodes.slice(0, -1)
    // na2 and na4 are straight on the outline and used by the two ways only, so they go
    expect(new Set(outlineIDs)).toEqual(new Set(['na1', 'nb1', 'nb2', 'na5']))
    expect(result.hasEntity('na2')).toBeUndefined()
    expect(result.hasEntity('na4')).toBeUndefined()
    expect(areaOf(outlineOf(result, 'w1'))).toBeCloseTo(200, 6)
    expect(result.hasEntity('na3')).toBeUndefined()
    expect(result.hasEntity('w2')).toBeUndefined()
  })
  it('an area inside another that shares its edges merges into the outer outline', () => {
    const base = graphOf(
      ...square('a', 0, 0, 10),
      node('nb1', 0, 0),
      node('nb2', 10, 0),
      node('nb3', 10, 5),
      node('nb4', 0, 5),
      ring('w1', ['na1', 'na2', 'na3', 'na4']),
      ring('w2', ['nb1', 'nb2', 'nb3', 'nb4']),
    )
    const result = mergeOf(base, ['w1', 'w2'])
    expect(areaOf(outlineOf(result, 'w1'))).toBeCloseTo(100, 6)
    expect((result.entity('w1') as OsmWay).nodes.slice(0, -1).length).toBe(4)
    expect(result.hasEntity('w2')).toBeUndefined()
    // (0,0) and (10,0) are corners of the survivor already; (10,5) and (0,5) are straight and unused
    for (const id of ['nb1', 'nb2', 'nb3', 'nb4']) expect(result.hasEntity(id)).toBeUndefined()
  })
  it('arc nodes that were straight in their own circle all stay: only the two crossings are new', () => {
    // Two 600-node circles, 195 m apart. Each node turns by 0.6 degrees, so none was a corner and none goes
    const entities: OsmEntity[] = [...circleNodes('a', 600, 0), ...circleNodes('b', 600, 195)]
    entities.push(ring('w1', circleIDs('a', 600)), ring('w2', circleIDs('b', 600)))
    const base = graphOf(...entities)
    const result = mergeOf(base, ['w1', 'w2'])
    const outline = (result.entity('w1') as OsmWay).nodes.slice(0, -1)

    const outsideB = circleIDs('a', 600).filter(
      (id) => distance(metresOf(base.entity(id) as OsmNode), [195, 0]) >= 100,
    )
    const outsideA = circleIDs('b', 600).filter(
      (id) => distance(metresOf(base.entity(id) as OsmNode), [0, 0]) >= 100,
    )
    expect(newNodeIDs(base, result, 'w1').length).toBe(2)
    expect(outline.length).toBe(outsideA.length + outsideB.length + 2)
    for (const id of [...outsideA, ...outsideB]) {
      expect(outline).toContain(id)
      expect((result.entity(id) as OsmNode).loc).toEqual((base.entity(id) as OsmNode).loc)
    }
  })
})

describe('merge areas: shapes that are not two closed ways', () => {
  it('three ways are refused as not_two_areas', () => {
    const base = graphOf(...twoSquares(7, 7), ring('w3', ['na1', 'na2', 'na3', 'na4']))
    expect(outcomeOf(base, ['w1', 'w2', 'w3'])).toBe('not_two_areas')
  })

  it('an open way is refused as not_two_areas', () => {
    const base = graphOf(
      ...square('a', 0, 0, 10),
      ...square('b', 7, 7, 10),
      ring('w1', ['na1', 'na2', 'na3', 'na4']),
      way('w2', ['nb1', 'nb2', 'nb3']),
    )
    expect(outcomeOf(base, ['w1', 'w2'])).toBe('not_two_areas')
  })

  it('a clockwise survivor keeps its direction in the merged outline', () => {
    const base = graphOf(
      ...square('a', 0, 0, 10),
      ...square('b', 7, 7, 10),
      ring('w1', ['na4', 'na3', 'na2', 'na1']),
      ring('w2', ['nb1', 'nb2', 'nb3', 'nb4']),
    )
    const outline = outlineOf(mergeOf(base, ['w1', 'w2']), 'w1')
    expect(outline.length).toBe(8)
    expect(signedAreaOf(outline)).toBeCloseTo(-191, 6)
  })

  it('a multipolygon relation is refused as multipolygon', () => {
    const base = graphOf(
      ...twoSquares(7, 7),
      new OsmRelation(context, {
        id: 'r1',
        tags: { type: 'multipolygon' },
        members: [{ type: 'way', id: 'w2', role: 'outer' }],
      }),
    )
    expect(outcomeOf(base, ['w1', 'r1'])).toBe('multipolygon')
  })

  it('a result with a hole is refused as not_simple', () => {
    // A U-shape with a bridge across its opening: the bridge closes a hole in the union
    const base = graphOf(
      node('nu1', 0, 0),
      node('nu2', 30, 0),
      node('nu3', 30, 30),
      node('nu4', 20, 30),
      node('nu5', 20, 10),
      node('nu6', 10, 10),
      node('nu7', 10, 30),
      node('nu8', 0, 30),
      node('nv1', 5, 25),
      node('nv2', 25, 25),
      node('nv3', 25, 35),
      node('nv4', 5, 35),
      ring('w1', ['nu1', 'nu2', 'nu3', 'nu4', 'nu5', 'nu6', 'nu7', 'nu8']),
      ring('w2', ['nv1', 'nv2', 'nv3', 'nv4']),
    )
    expect(outcomeOf(base, ['w1', 'w2'])).toBe('not_simple')
  })

  it('an outline of more than 2000 nodes is refused as too_many_nodes', () => {
    // Two 1100-node circles, 195 m apart: no node is a corner, so all survivors stay (about 2046 nodes)
    const entities: OsmEntity[] = [...circleNodes('a', 1100, 0), ...circleNodes('b', 1100, 195)]
    entities.push(ring('w1', circleIDs('a', 1100)), ring('w2', circleIDs('b', 1100)))
    const base = graphOf(...entities)
    expect(outcomeOf(base, ['w1', 'w2'])).toBe('too_many_nodes')
  }, 20000)
})

describe('merge areas: tags and relations', () => {
  it('different tags are refused as conflicting_tags', () => {
    const base = graphOf(
      ...square('a', 0, 0, 10),
      ...square('b', 7, 7, 10),
      ring('w1', ['na1', 'na2', 'na3', 'na4'], { building: 'yes' }),
      ring('w2', ['nb1', 'nb2', 'nb3', 'nb4'], { building: 'house' }),
    )
    expect(outcomeOf(base, ['w1', 'w2'])).toBe('conflicting_tags')
  })

  it('area=yes on one way is not a conflict, and the result keeps it when no tag already makes an area', () => {
    // No tag schema in this test, so nothing implies an area and area=yes stays
    const base = graphOf(
      ...square('a', 0, 0, 10),
      ...square('b', 7, 7, 10),
      ring('w1', ['na1', 'na2', 'na3', 'na4'], { amenity: 'parking', area: 'yes' }),
      ring('w2', ['nb1', 'nb2', 'nb3', 'nb4'], { amenity: 'parking' }),
    )
    const result = mergeOf(base, ['w1', 'w2'])
    expect((result.entity('w1') as OsmWay).tags).toEqual({ amenity: 'parking', area: 'yes' })
  })

  it('different parent relations are refused as conflicting_relations', () => {
    const base = graphOf(
      ...twoSquares(7, 7),
      new OsmRelation(context, {
        id: 'r1',
        tags: { type: 'boundary' },
        members: [{ type: 'way', id: 'w1', role: '' }],
      }),
    )
    expect(outcomeOf(base, ['w1', 'w2'])).toBe('conflicting_relations')
  })

  it('a shared parent relation keeps the survivor as a member and the loser leaves it', () => {
    const base = graphOf(
      ...twoSquares(7, 7),
      new OsmRelation(context, {
        id: 'r1',
        tags: { type: 'boundary' },
        members: [
          { type: 'way', id: 'w1', role: '' },
          { type: 'way', id: 'w2', role: '' },
        ],
      }),
    )
    const result = mergeOf(base, ['w1', 'w2'])
    expect((result.entity('r1') as OsmRelation).members.map((member) => member.id)).toEqual(['w1'])
  })

  it('a node that leaves the outline and is used by another way is refused as shared_nodes_outside', () => {
    // nb1 (7,7) is inside the first square; a neighbour uses it
    const base = graphOf(...twoSquares(7, 7), node('nx', 40, 40), way('w9', ['nb1', 'nx']))
    expect(outcomeOf(base, ['w1', 'w2'])).toBe('shared_nodes_outside')
  })

  it('a node shared with another way is fine when it stays on the outline', () => {
    // nb2 (17,7) is a corner of the outline
    const base = graphOf(...twoSquares(7, 7), node('nx', 40, 40), way('w9', ['nb2', 'nx']))
    expect(outcomeOf(base, ['w1', 'w2'])).toBe('merged')
  })

  it('a tagged node that leaves the outline is refused as tagged_nodes', () => {
    // na3 (10,10) is inside the second square
    const base = graphOf(
      node('na1', 0, 0),
      node('na2', 10, 0),
      node('na3', 10, 10, { name: 'Hof' }),
      node('na4', 0, 10),
      ...square('b', 7, 7, 10),
      ring('w1', ['na1', 'na2', 'na3', 'na4']),
      ring('w2', ['nb1', 'nb2', 'nb3', 'nb4']),
    )
    expect(outcomeOf(base, ['w1', 'w2'])).toBe('tagged_nodes')
  })
})

describe('merge areas: survivor and node ids', () => {
  it('the older way survives: an existing id beats a new one, and the lower number wins', () => {
    const newer = graphOf(
      ...square('a', 0, 0, 10),
      ...square('b', 7, 7, 10),
      ring('w-3', ['na1', 'na2', 'na3', 'na4']),
      ring('w12', ['nb1', 'nb2', 'nb3', 'nb4']),
    )
    const plan = mergePlan(new Graph(newer), ['w-3', 'w12'])
    expect('survivor' in plan && plan.survivor).toBe('w12')
    const result = mergeOf(newer, ['w-3', 'w12'])
    expect(result.hasEntity('w-3')).toBeUndefined()

    const lower = graphOf(
      ...square('a', 0, 0, 10),
      ...square('b', 7, 7, 10),
      ring('w7', ['na1', 'na2', 'na3', 'na4']),
      ring('w3', ['nb1', 'nb2', 'nb3', 'nb4']),
    )
    const plan2 = mergePlan(new Graph(lower), ['w7', 'w3'])
    expect('survivor' in plan2 && plan2.survivor).toBe('w3')
  })

  it('new nodes get negative ids from the graph context, unique and not in the base graph', () => {
    const base = lShape()
    const result = mergeOf(base, ['w1', 'w2'])
    const added = newNodeIDs(base, result, 'w1')
    expect(added.length).toBe(2)
    for (const id of added) expect(id).toMatch(/^n-\d+$/)
    expect(new Set(added).size).toBe(added.length)
  })

  it('the base graph is untouched, so undoing the action restores both ways, their nodes and the relation', () => {
    const base = graphOf(
      ...twoSquares(7, 7),
      new OsmRelation(context, {
        id: 'r1',
        tags: { type: 'boundary' },
        members: [
          { type: 'way', id: 'w1', role: '' },
          { type: 'way', id: 'w2', role: '' },
        ],
      }),
    )
    const before = (base.entity('w2') as OsmWay).nodes.slice()
    mergeOf(base, ['w1', 'w2'])

    expect((base.entity('w2') as OsmWay).nodes).toEqual(before)
    expect(base.hasEntity('nb1')).toBeDefined()
    expect((base.entity('r1') as OsmRelation).members.map((member) => member.id)).toEqual([
      'w1',
      'w2',
    ])
    expect((base.entity('w1') as OsmWay).nodes.length).toBe(5)
  })
})

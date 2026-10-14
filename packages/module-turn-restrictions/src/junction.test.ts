import { describe, expect, it } from 'bun:test'
import {
  Graph,
  ModelContext,
  OsmNode,
  OsmRelation,
  OsmWay,
  osmIntersection,
  actionDeleteWay,
} from '@osm-editor-kit/maid-model'
import { resolveWayStyle, tagClasses } from '@osm-editor-kit/maid-style'
import { crossing } from './fixtures.ts'
import { isJunction } from './is-junction.ts'
import {
  MIN_ARM_LENGTH,
  TURN_BUTTON_RADIUS,
  extendArm,
  junctionSketch,
  junctionTurns,
  relatedWayIDs,
  roadLook,
  type Point,
} from './junction.ts'
import { cycleTurn } from './turns.ts'

const { context, graph } = crossing()
const box = { width: 400, height: 300, padding: 36 }

function intersectionOf(g: Graph) {
  const result = osmIntersection(context, g, 'c', 30)
  if (!result) throw new Error('no intersection')
  return result
}

describe('isJunction', () => {
  it('is true for the vertex of three or more highways and false for the end of a road', () => {
    expect(isJunction(graph, 'c')).toBe(true)
    expect(isJunction(graph, 'nn')).toBe(false)
  })

  it('is false for a vertex of two highways (a bend)', () => {
    const two = [
      new OsmNode(context, { id: 'b', loc: [0, 0] }),
      new OsmNode(context, { id: 'b1', loc: [0, 0.0002] }),
      new OsmNode(context, { id: 'b2', loc: [0.0002, 0] }),
      new OsmWay(context, { id: 'bw1', nodes: ['b', 'b1'], tags: { highway: 'residential' } }),
      new OsmWay(context, { id: 'bw2', nodes: ['b', 'b2'], tags: { highway: 'residential' } }),
    ]
    expect(isJunction(new Graph(context, two), 'b')).toBe(false)
  })
})

describe('junctionSketch', () => {
  it('fits the roads into the box with the junction inside it', () => {
    const sketch = junctionSketch(intersectionOf(graph), 'c', 30, box)!
    expect(sketch.roads).toHaveLength(4)
    const [x, y] = sketch.centre
    expect(x).toBeGreaterThan(0)
    expect(x).toBeLessThan(box.width)
    expect(y).toBeGreaterThan(0)
    expect(y).toBeLessThan(box.height)
    for (const road of sketch.roads) {
      for (const [px, py] of road.points) {
        expect(px).toBeGreaterThanOrEqual(0)
        expect(px).toBeLessThanOrEqual(box.width)
        expect(py).toBeGreaterThanOrEqual(0)
        expect(py).toBeLessThanOrEqual(box.height)
      }
    }
  })

  it('draws the north road above the junction and the east road to its right', () => {
    const sketch = junctionSketch(intersectionOf(graph), 'c', 30, box)!
    const road = (id: string) => sketch.roads.find((r) => r.id === id)!
    const [, northY] = road('wn').points[road('wn').points.length - 1]!
    const [eastX] = road('we').points[road('we').points.length - 1]!
    expect(northY).toBeLessThan(sketch.centre[1])
    expect(eastX).toBeGreaterThan(sketch.centre[0])
  })

  it('keeps the names: the name, else the ref, else none', () => {
    const sketch = junctionSketch(intersectionOf(graph), 'c', 30, box)!
    const names = Object.fromEntries(sketch.roads.map((road) => [road.id, road.name]))
    expect(names).toEqual({ wn: 'North', we: 'East', ws: 'S 1', ww: undefined })
  })
})

describe('junctionTurns', () => {
  it('draws one arrow for each turn of the FROM road: left, straight, right and the U-turn back on it', () => {
    const i = intersectionOf(graph)
    const sketch = junctionSketch(i, 'c', 30, box)!
    const turns = junctionTurns(sketch, i, 'wn', 0)
    expect(turns.map((t) => t.to).sort()).toEqual(['we', 'wn', 'ws', 'ww'])
    expect(turns.find((t) => t.to === 'wn')?.kind).toBe('u_turn')
    for (const turn of turns) {
      expect(turn.path.startsWith('M ')).toBe(true)
      expect(turn.state).toBe('allowed')
      expect(turn.indirect).toBe(false)
      expect(turn.kind).toBeDefined()
    }
  })

  it('shows a restricted turn as restricted with its kind', () => {
    const i = intersectionOf(graph)
    const turn = i.turns('wn', 0).find((t) => t.to.way === 'ws')!
    const step = cycleTurn(i, turn, 'wn', [])!
    const g = step.actions.reduce((current, action) => action(current), new Graph(graph))
    const next = intersectionOf(g)
    const shown = junctionTurns(junctionSketch(next, 'c', 30, box)!, next, 'wn', 0)
    const south = shown.find((t) => t.to === 'ws')!
    expect(south.state).toBe('restricted')
    expect(south.kind).toBe('straight_on')
  })
})

describe('roads changed later', () => {
  it('deleting a road of a restriction takes it out of the relation', () => {
    const i = intersectionOf(graph)
    const turn = i.turns('wn', 0).find((t) => t.to.way === 'ws')!
    const restricted = cycleTurn(i, turn, 'wn', [])!.actions.reduce(
      (current, action) => action(current),
      new Graph(graph),
    )
    const relations = restricted.parentRelations(restricted.entity('ws'))
    expect(relations.length).toBe(1)
    const deleted = actionDeleteWay('ws')(restricted)
    for (const relation of relations) {
      const after = deleted.hasEntity(relation.id)
      if (after instanceof OsmRelation) expect(after.members.some((m) => m.id === 'ws')).toBe(false)
    }
  })
})

describe('junctionSketch turned by the map bearing', () => {
  it('keeps north up at bearing 0 and turns the roads to the screen at bearing 90 (east up, north left)', () => {
    const north = (bearing: number) =>
      junctionSketch(intersectionOf(graph), 'c', 30, box, bearing)!.roads.find(
        (road) => road.id === 'wn',
      )!
    const east = (bearing: number) =>
      junctionSketch(intersectionOf(graph), 'c', 30, box, bearing)!.roads.find(
        (road) => road.id === 'we',
      )!
    expect(north(0).heading).toBeCloseTo(0, 6)
    expect(east(0).heading).toBeCloseTo(90, 6)
    // the turn is counter-clockwise, as MapLibre's bearing is: north moves to the screen's left, east to the top
    expect(north(90).heading).toBeCloseTo(270, 6)
    expect(east(90).heading).toBeCloseTo(0, 6)
  })

  it('draws the turned sketch in the box with the junction inside it', () => {
    const sketch = junctionSketch(intersectionOf(graph), 'c', 30, box, 135)!
    const [x, y] = sketch.centre
    expect(x).toBeGreaterThan(0)
    expect(x).toBeLessThan(box.width)
    expect(y).toBeGreaterThan(0)
    expect(y).toBeLessThan(box.height)
    for (const road of sketch.roads) {
      for (const [px, py] of road.points) {
        expect(px).toBeGreaterThanOrEqual(0)
        expect(px).toBeLessThanOrEqual(box.width)
        expect(py).toBeGreaterThanOrEqual(0)
        expect(py).toBeLessThanOrEqual(box.height)
      }
    }
  })

  it('gives each road its highway tag and its length in the drawing', () => {
    const sketch = junctionSketch(intersectionOf(graph), 'c', 30, box)!
    const north = sketch.roads.find((road) => road.id === 'wn')!
    expect(north.highway).toBe('residential')
    // the fixture's road is about 22 m long, all of it within the 30 m distance
    expect(north.length).toBeGreaterThan(20)
    expect(north.length).toBeLessThan(25)
  })
})

describe('relatedWayIDs', () => {
  it('is the FROM road alone while no turn is hovered', () => {
    expect(relatedWayIDs('wn', undefined)).toEqual(['wn'])
    expect(relatedWayIDs(null, undefined)).toEqual([])
  })

  it('adds the TO road of a hovered turn, once each', () => {
    const intersection = intersectionOf(graph)
    const sketch = junctionSketch(intersection, 'c', 30, box)!
    const turns = junctionTurns(sketch, intersection, 'wn', 0)
    const turn = turns[0]!
    const ids = relatedWayIDs('wn', turn)
    expect(ids[0]).toBe('wn')
    expect(ids).toContain(turn.to)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

/** A junction with a 75 m primary road to the north, a 10 m dead end to the south and a 22 m road to the east */
function tJunctionWithShortArm() {
  const context = new ModelContext()
  const graph = new Graph(context, [
    new OsmNode(context, { id: 'c', loc: [0, 0] }),
    new OsmNode(context, { id: 'n', loc: [0, 0.00067] }),
    new OsmNode(context, { id: 's', loc: [0, -0.00009] }),
    new OsmNode(context, { id: 'e', loc: [0.0002, 0] }),
    new OsmWay(context, { id: 'main', nodes: ['c', 'n'], tags: { highway: 'primary' } }),
    new OsmWay(context, { id: 'dead', nodes: ['c', 's'], tags: { highway: 'residential' } }),
    new OsmWay(context, { id: 'east', nodes: ['c', 'e'], tags: { highway: 'residential' } }),
  ])
  const intersection = osmIntersection(context, graph, 'c', 75)
  if (!intersection) throw new Error('no intersection')
  return { context, graph, intersection }
}

/** The distance of a point from the centre, in SVG units */
function distanceOf(point: Point, centre: Point): number {
  return Math.hypot(point[0] - centre[0], point[1] - centre[1])
}

describe('extendArm', () => {
  const centre: Point = [100, 100]

  it('pushes a short road out to the minimum length along its direction, and marks where it really ends', () => {
    const result = extendArm([centre, [100, 130]], centre, MIN_ARM_LENGTH)
    expect(result.dataEnd).toBe(1)
    expect(result.points).toHaveLength(3)
    const end = result.points[2]!
    expect(end[0]).toBeCloseTo(100, 6)
    expect(end[1]).toBeCloseTo(100 + MIN_ARM_LENGTH, 6)
  })

  it('keeps the direction of a diagonal road', () => {
    const result = extendArm([centre, [103, 104]], centre, 10)
    expect(result.points[2]![0]).toBeCloseTo(106, 6)
    expect(result.points[2]![1]).toBeCloseTo(108, 6)
  })

  it('leaves a road that is long enough alone: no stub', () => {
    const result = extendArm([centre, [100, 250]], centre, MIN_ARM_LENGTH)
    expect(result).toEqual({ points: [centre, [100, 250]], dataEnd: 1 })
  })

  it('does not extend a road without a direction', () => {
    expect(extendArm([centre], centre, MIN_ARM_LENGTH)).toEqual({ points: [centre], dataEnd: 0 })
    expect(extendArm([], centre, MIN_ARM_LENGTH)).toEqual({ points: [], dataEnd: 0 })
  })
})

describe('roadLook', () => {
  const styleOf = (highway: string) => resolveWayStyle(tagClasses({ highway }), 'line')

  it('takes the fill and the casing of a road from the map style, for a few classes', () => {
    for (const highway of ['motorway', 'primary', 'residential', 'service', 'track']) {
      const style = styleOf(highway)
      expect(roadLook(highway).fill).toBe(style.stroke.color!)
      expect(roadLook(highway).casing).toBe(style.casing.color)
    }
  })

  it('has the colours the map draws: a primary road orange with a brown casing, a residential road white', () => {
    expect(roadLook('primary')).toMatchObject({ fill: '#F99806', casing: '#70372f', dashed: false })
    expect(roadLook('residential')).toMatchObject({ fill: '#fff', casing: '#444' })
  })

  it('draws a link like its class', () => {
    expect(roadLook('primary_link')).toEqual(roadLook('primary'))
  })

  it('draws a footway dashed and wider apart from its fill, as the map does', () => {
    const look = roadLook('footway')
    expect(look).toMatchObject({ fill: styleOf('footway').stroke.color, dashed: true, width: 3 })
    expect(look.casingWidth).toBeGreaterThan(look.width)
  })

  it('draws a road of an unknown class in the style fallback, and a road with no highway tag too', () => {
    expect(roadLook('road').fill).toBe(styleOf('road').stroke.color!)
    expect(roadLook(undefined).fill).toBe(
      resolveWayStyle(tagClasses({}), 'line').stroke.color ?? '#a1a1aa',
    )
  })

  it('draws a road wider than its casing is thick, so the casing shows on both sides', () => {
    expect(roadLook('primary').casingWidth).toBeGreaterThan(roadLook('primary').width)
  })
})

describe('junctionSketch: the fit around the junction', () => {
  const sketch = () => junctionSketch(intersectionOf(graph), 'c', 30, box)!

  it('puts the junction in the middle of the box', () => {
    const { centre } = sketch()
    expect(centre[0]).toBeCloseTo(box.width / 2, 6)
    expect(centre[1]).toBeCloseTo(box.height / 2, 6)
  })

  it('reaches the padding with the widest road: the 22 m north arm fills the height less the padding', () => {
    const ends = sketch().roads.map((road) => road.points[road.dataEnd]!)
    const top = Math.min(...ends.map(([, y]) => y))
    expect(top).toBeCloseTo(box.padding, 6)
  })

  it('draws a road that ends nearer than MIN_ARM_LENGTH past its real end, as a stub', () => {
    const { roads, centre } = junctionSketch(tJunctionWithShortArm().intersection, 'c', 75, box)!
    const dead = roads.find((road) => road.id === 'dead')!
    expect(dead.dataEnd).toBe(1)
    expect(dead.points).toHaveLength(3)
    expect(distanceOf(dead.points[2]!, centre)).toBeCloseTo(MIN_ARM_LENGTH, 6)
    expect(distanceOf(dead.points[dead.dataEnd]!, centre)).toBeLessThan(MIN_ARM_LENGTH)
  })

  it('draws a road that reaches the search distance without a stub', () => {
    const { roads } = junctionSketch(tJunctionWithShortArm().intersection, 'c', 75, box)!
    const main = roads.find((road) => road.id === 'main')!
    expect(main.points).toHaveLength(main.dataEnd + 1)
  })

  it('does not blow a tiny junction up: a few metres of road stay small in the box', () => {
    const context = new ModelContext()
    const graph = new Graph(context, [
      new OsmNode(context, { id: 'c', loc: [0, 0] }),
      new OsmNode(context, { id: 'n', loc: [0, 0.00001] }),
      new OsmNode(context, { id: 's', loc: [0, -0.00001] }),
      new OsmNode(context, { id: 'e', loc: [0.00001, 0] }),
      new OsmWay(context, { id: 'a', nodes: ['c', 'n'], tags: { highway: 'residential' } }),
      new OsmWay(context, { id: 'b', nodes: ['c', 's'], tags: { highway: 'residential' } }),
      new OsmWay(context, { id: 'd', nodes: ['c', 'e'], tags: { highway: 'residential' } }),
    ])
    const { roads, centre } = junctionSketch(intersectionOf(graph), 'c', 30, box)!
    // 1.1 m of road; the least half-span of 12 m puts that at about 10 SVG units from the junction
    const real = roads.map((road) => distanceOf(road.points[road.dataEnd]!, centre))
    expect(Math.max(...real)).toBeLessThan(20)
  })
})

describe('junctionTurns: the buttons sit on the TO roads, a fixed distance out', () => {
  it('puts each button TURN_BUTTON_RADIUS from the junction, on its TO road, the U-turn on the FROM road', () => {
    const i = intersectionOf(graph)
    const sketch = junctionSketch(i, 'c', 30, box)!
    for (const turn of junctionTurns(sketch, i, 'wn', 0)) {
      expect(distanceOf(turn.at, sketch.centre)).toBeCloseTo(TURN_BUTTON_RADIUS, 6)
      const road = sketch.roads.find((r) => r.id === turn.to)!
      // the button is on the road's line: the road's own point at that radius, not a point beside it
      const [ax, ay] = road.points[road.dataEnd]!
      const [cx, cy] = sketch.centre
      const onRoad = (ax - cx) * (turn.at[1] - cy) - (ay - cy) * (turn.at[0] - cx)
      expect(Math.abs(onRoad)).toBeLessThan(1e-6)
    }
  })

  it('keeps the buttons apart: four turns at a crossing are not clustered at the centre', () => {
    const i = intersectionOf(graph)
    const sketch = junctionSketch(i, 'c', 30, box)!
    const turns = junctionTurns(sketch, i, 'wn', 0)
    for (let a = 0; a < turns.length; a += 1) {
      for (let b = a + 1; b < turns.length; b += 1) {
        expect(distanceOf(turns[a]!.at, turns[b]!.at)).toBeGreaterThan(TURN_BUTTON_RADIUS)
      }
    }
  })

  it('draws the arrow from the FROM road to its button', () => {
    const i = intersectionOf(graph)
    const sketch = junctionSketch(i, 'c', 30, box)!
    const turn = junctionTurns(sketch, i, 'wn', 0).find((t) => t.to === 'we')!
    const [, startX, startY] = turn.path.match(/^M (\S+) (\S+) Q/)!.map(Number) as [
      number,
      number,
      number,
    ]
    const from = sketch.roads.find((r) => r.id === 'wn')!.points[0]!
    expect(distanceOf([startX, startY], sketch.centre)).toBeLessThan(TURN_BUTTON_RADIUS)
    expect(distanceOf([startX, startY], from)).toBeLessThan(TURN_BUTTON_RADIUS)
    expect(turn.path.endsWith(`${turn.at[0]} ${turn.at[1]}`)).toBe(true)
  })
})

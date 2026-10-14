import { describe, expect, it } from 'bun:test'
import {
  Graph,
  OsmNode,
  OsmRelation,
  OsmWay,
  osmIntersection,
  actionDeleteWay,
} from '@osm-editor-kit/maid-model'
import { crossing } from './fixtures.ts'
import { isJunction } from './is-junction.ts'
import { junctionSketch, junctionTurns, relatedWayIDs } from './junction.ts'
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
    const turns = junctionTurns(sketch, i, 'wn', 0, 80)
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
    const shown = junctionTurns(junctionSketch(next, 'c', 30, box)!, next, 'wn', 0, 80)
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
    const turns = junctionTurns(sketch, intersection, 'wn', 0, 80)
    const turn = turns[0]!
    const ids = relatedWayIDs('wn', turn)
    expect(ids[0]).toBe('wn')
    expect(ids).toContain(turn.to)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

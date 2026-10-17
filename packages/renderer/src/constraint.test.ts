import { describe, expect, test } from 'bun:test'
import {
  applyConstraints,
  dragNeighbours,
  drawNeighbours,
  metresPerPixel,
  type ConstraintMap,
  type Neighbour,
} from './constraint'
import type { ConstraintInput, ConstraintItem } from './extension-points'
import { NO_MODIFIERS } from './modifiers'

/** Node ids a, b, c... at the locations (lon, lat) of their letters: a=[1,1], b=[2,2]... */
const locs: Record<string, [number, number]> = {
  a: [1, 1],
  b: [2, 2],
  c: [3, 3],
  d: [4, 4],
  e: [5, 5],
}
const locOf = (id: string) => locs[id]

/** Ids of neighbours, for the readable side of the assertions: the letter of each node */
function letters(neighbours: Neighbour[]): { at: string | undefined; before?: string }[] {
  const name = (loc: [number, number]) => Object.keys(locs).find((k) => locs[k] === loc)
  return neighbours.map((n) =>
    n.before ? { at: name(n.at), before: name(n.before) } : { at: name(n.at) },
  )
}

describe('drawNeighbours', () => {
  test('a line grows at its end: one neighbour, the node before it as `before`', () => {
    expect(letters(drawNeighbours('line', ['a', 'b', 'c'], false, locOf))).toEqual([
      { at: 'c', before: 'b' },
    ])
  })

  test('a continued line grows at its start', () => {
    expect(letters(drawNeighbours('line', ['a', 'b', 'c'], true, locOf))).toEqual([
      { at: 'a', before: 'b' },
    ])
  })

  test('a line with one fixed node has one neighbour and no `before`', () => {
    expect(drawNeighbours('line', ['a'], false, locOf)).toEqual([{ at: [1, 1] }])
  })

  test('an area has two neighbours: its last and its first fixed node', () => {
    expect(letters(drawNeighbours('area', ['a', 'b', 'c', 'd'], false, locOf))).toEqual([
      { at: 'd', before: 'c' },
      { at: 'a', before: 'b' },
    ])
  })

  test('an area with two fixed nodes: each one is the before of the other', () => {
    expect(letters(drawNeighbours('area', ['a', 'b'], false, locOf))).toEqual([
      { at: 'b', before: 'a' },
      { at: 'a', before: 'b' },
    ])
  })

  test('an area with one fixed node has one neighbour', () => {
    expect(letters(drawNeighbours('area', ['a'], false, locOf))).toEqual([{ at: 'a' }])
  })

  test('nothing fixed, nothing next to the node', () => {
    expect(drawNeighbours('line', [], false, locOf)).toEqual([])
  })

  test('a neighbour that is not loaded is left out', () => {
    expect(letters(drawNeighbours('line', ['a', 'zz'], false, locOf))).toEqual([])
  })
})

describe('dragNeighbours', () => {
  test('a vertex in the middle of a line: the node before and the node after, each with its own `before`', () => {
    expect(letters(dragNeighbours('b', ['a', 'b', 'c', 'd'], false, locOf))).toEqual([
      { at: 'a' },
      { at: 'c', before: 'd' },
    ])
  })

  test('a vertex in the middle of a line, further along: both neighbours have a `before`', () => {
    expect(letters(dragNeighbours('c', ['a', 'b', 'c', 'd', 'e'], false, locOf))).toEqual([
      { at: 'b', before: 'a' },
      { at: 'd', before: 'e' },
    ])
  })

  test('the end of a line has one neighbour', () => {
    expect(letters(dragNeighbours('a', ['a', 'b', 'c'], false, locOf))).toEqual([
      { at: 'b', before: 'c' },
    ])
  })

  test('a closed way wraps around and skips its repeated first node', () => {
    // the ring a b c d, closed by a again: a has d before it and b after it
    expect(letters(dragNeighbours('a', ['a', 'b', 'c', 'd', 'a'], true, locOf))).toEqual([
      { at: 'd', before: 'c' },
      { at: 'b', before: 'c' },
    ])
  })

  test('a closed way, a vertex in its middle', () => {
    expect(letters(dragNeighbours('b', ['a', 'b', 'c', 'd', 'a'], true, locOf))).toEqual([
      { at: 'a', before: 'd' },
      { at: 'c', before: 'd' },
    ])
  })

  test('a closed way with only two nodes has no corner to constrain', () => {
    expect(dragNeighbours('a', ['a', 'b', 'a'], true, locOf)).toEqual([])
  })

  test('a node that is not in the way has no neighbours', () => {
    expect(dragNeighbours('e', ['a', 'b', 'c'], false, locOf)).toEqual([])
  })
})

/** A map with a scale of 100 pixels per degree: project and unproject are exact inverses */
const fakeMap: ConstraintMap = {
  project: ([lng, lat]) => ({ x: lng * 100, y: lat * 100 }),
  unproject: ([x, y]) => ({ lng: x / 100, lat: y / 100 }),
  getBearing: () => 15,
  getZoom: () => 2,
}

/** An item that gives the place `point` with one guide, and records what it was asked */
function itemGiving(
  id: string,
  point: { x: number; y: number } | undefined,
  asked: ConstraintInput[] = [],
): ConstraintItem {
  return {
    id,
    constrain(input) {
      asked.push(input)
      if (!point) return undefined
      return { point, guides: [[{ x: 0, y: 0 }, point]] }
    },
  }
}

describe('applyConstraints', () => {
  const neighbours: Neighbour[] = [{ at: [0.5, 0.5], before: [0.25, 0.25] }]
  const input = {
    kind: 'draw' as const,
    point: { x: 1, y: 1 },
    neighbours,
    modifiers: { ...NO_MODIFIERS, shift: true },
  }

  test('a registered result gives the place: its point, back in lon/lat, and its guides', () => {
    const placed = applyConstraints(fakeMap, [itemGiving('angle', { x: 300, y: 200 })], input)
    expect(placed).toEqual({
      loc: [3, 2],
      guides: [
        [
          [0, 0],
          [3, 2],
        ],
      ],
    })
  })

  test('the item is asked with the neighbours and the modifiers on the screen, and the bearing', () => {
    const asked: ConstraintInput[] = []
    applyConstraints(fakeMap, [itemGiving('angle', { x: 300, y: 200 }, asked)], input)
    expect(asked).toEqual([
      {
        kind: 'draw',
        point: { x: 1, y: 1 },
        neighbours: [{ at: { x: 50, y: 50 }, before: { x: 25, y: 25 } }],
        modifiers: { ...NO_MODIFIERS, shift: true },
        bearing: 15,
        metresPerPixel: metresPerPixel(0.5, 2),
      },
    ])
  })

  test('the first item with a result wins; the later ones are not asked', () => {
    const later: ConstraintInput[] = []
    const placed = applyConstraints(
      fakeMap,
      [itemGiving('first', { x: 100, y: 100 }), itemGiving('second', { x: 500, y: 500 }, later)],
      input,
    )
    expect(placed?.loc).toEqual([1, 1])
    expect(later).toEqual([])
  })

  test('an item without a result passes the place on to the next', () => {
    const placed = applyConstraints(
      fakeMap,
      [itemGiving('none', undefined), itemGiving('second', { x: 500, y: 500 })],
      input,
    )
    expect(placed?.loc).toEqual([5, 5])
  })

  test('no item gives a result, or there are no items: no constraint', () => {
    expect(applyConstraints(fakeMap, [itemGiving('none', undefined)], input)).toBeUndefined()
    expect(applyConstraints(fakeMap, [], input)).toBeUndefined()
  })
})

describe('metresPerPixel', () => {
  test('at the equator, zoom 0 is a 512 pixel world: 40075 km over 512 pixels', () => {
    expect(metresPerPixel(0, 0)).toBeCloseTo(40075016.686 / 512, 3)
  })

  test('each zoom level halves it, and a latitude of 60 degrees halves it again', () => {
    expect(metresPerPixel(0, 19)).toBeCloseTo(metresPerPixel(0, 18) / 2, 9)
    expect(metresPerPixel(60, 19)).toBeCloseTo(metresPerPixel(0, 19) / 2, 9)
  })

  test('at zoom 19 and latitude 52 a pixel is about 0.09 m on the ground', () => {
    expect(metresPerPixel(52, 19)).toBeCloseTo(0.0919, 4)
  })
})

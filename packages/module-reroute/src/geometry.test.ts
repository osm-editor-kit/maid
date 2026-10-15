import { describe, expect, test } from 'bun:test'
import { distanceToLineM, lineLengthM, segmentLine, wayLine } from './geometry.ts'
import { graphOf, node, way } from './test-graph.ts'

describe('the shapes of the data', () => {
  test('a way is its nodes in order; a way with a node not loaded has no line', () => {
    const graph = graphOf([node('a', 13.4, 52.5), node('b', 13.401, 52.5), way('w', ['a', 'b'])])
    expect(wayLine(graph, 'w')).toEqual([
      [13.4, 52.5],
      [13.401, 52.5],
    ])
    const partial = graphOf([node('a', 13.4, 52.5), way('w', ['a', 'missing'])])
    expect(wayLine(partial, 'w')).toEqual([])
  })

  test('the length of a line is the great-circle length of its segments', () => {
    // 0.001 degrees of longitude at 52.5 degrees north is about 67.8 m
    const length = lineLengthM([
      [13.4, 52.5],
      [13.401, 52.5],
    ])
    expect(length).toBeGreaterThan(67)
    expect(length).toBeLessThan(68.5)
  })

  test('the distance from a point to a line, on the ground', () => {
    const line: Array<[number, number]> = [
      [13.4, 52.5],
      [13.402, 52.5],
    ]
    // 0.0002 degrees of latitude north of the line is about 22 m
    expect(distanceToLineM([13.401, 52.5002], line)).toBeGreaterThan(21.5)
    expect(distanceToLineM([13.401, 52.5002], line)).toBeLessThan(22.5)
    // past the end of the line, the distance is to the end
    expect(distanceToLineM([13.403, 52.5], line)).toBeGreaterThan(67)
  })

  test('a segment line runs from the split, over the way nodes in the route order, to the next split', () => {
    const graph = graphOf([
      node('a', 13.4, 52.5),
      node('b', 13.401, 52.5),
      node('c', 13.402, 52.5),
      node('d', 13.403, 52.5),
      way('w', ['a', 'b', 'c', 'd']),
    ])
    const forward = segmentLine(graph, {
      wayId: 'w',
      fromIndex: 1,
      toIndex: 2,
      forward: true,
      lengthM: 0,
      startSplit: { wayId: 'w', segment: 0, t: 0.5, loc: [13.4005, 52.5] },
      endSplit: { wayId: 'w', segment: 2, t: 0.5, loc: [13.4025, 52.5] },
    })
    expect(forward.map((p) => p[0])).toEqual([13.4005, 13.401, 13.402, 13.4025])

    const backward = segmentLine(graph, {
      wayId: 'w',
      fromIndex: 2,
      toIndex: 1,
      forward: false,
      lengthM: 0,
    })
    expect(backward.map((p) => p[0])).toEqual([13.402, 13.401])
  })
})

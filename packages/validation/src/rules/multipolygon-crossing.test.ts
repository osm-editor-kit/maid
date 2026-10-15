import { describe, expect, it } from 'bun:test'
import { graphOf, node, relation, validateChanged, way } from '../id-test-helpers.ts'
import { multipolygonCrossing } from './multipolygon-crossing.ts'

const rule = multipolygonCrossing

/** A square from (0, 0) to (1, 1), as nodes n-a1..n-a4 and a closed way w-outer */
const square = [node('n-a1', 0, 0), node('n-a2', 0, 1), node('n-a3', 1, 1), node('n-a4', 1, 0)]
const outer = way('w-outer', ['n-a1', 'n-a2', 'n-a3', 'n-a4', 'n-a1'], { type: 'multipolygon' })

const multipolygon = (members: { id: string; type: 'way'; role: string }[]) =>
  relation('r-1', members, { type: 'multipolygon' })

describe('multipolygon_crossing', () => {
  it('warns about an inner ring that crosses the outer ring, once, at the crossing', () => {
    // a line from inside the square to outside, crossing the east edge at (1, 0.5)
    const graph = graphOf(
      ...square,
      outer,
      node('n-b1', 0.5, 0.5),
      node('n-b2', 1.5, 0.5),
      way('w-inner', ['n-b1', 'n-b2'], {}),
      multipolygon([
        { id: 'w-outer', type: 'way', role: 'outer' },
        { id: 'w-inner', type: 'way', role: 'inner' },
      ]),
    )
    const issues = validateChanged(rule, graph, ['r-1'])
    expect(issues).toHaveLength(1)
    const issue = issues[0]
    expect(issue?.rule).toBe('multipolygon_crossing')
    expect(issue?.severity).toBe('warning')
    expect(issue?.loc?.[0]).toBeCloseTo(1)
    expect(issue?.loc?.[1]).toBeCloseTo(0.5)
    expect(issue?.entityIds).toEqual(['r-1', 'w-inner', 'w-outer'])
    expect(issue?.message).toBe(
      'The inner way w-inner crosses the outer way w-outer in the multipolygon r-1, so the area is broken',
    )
    expect(issue?.fixes).toHaveLength(0)
    expect(issue?.data).toEqual({ ways: ['w-inner', 'w-outer'], roles: ['inner', 'outer'] })
  })

  it('gives one issue per crossing of the two rings, with an id that does not depend on the member order', () => {
    // a closed inner square that sticks out of the east edge: two crossings
    const inner = [
      node('n-c1', 0.5, 0.25),
      node('n-c2', 1.5, 0.25),
      node('n-c3', 1.5, 0.75),
      node('n-c4', 0.5, 0.75),
    ]
    const innerWay = way('w-inner', ['n-c1', 'n-c2', 'n-c3', 'n-c4', 'n-c1'], {})
    const ordered = graphOf(
      ...square,
      outer,
      ...inner,
      innerWay,
      multipolygon([
        { id: 'w-outer', type: 'way', role: 'outer' },
        { id: 'w-inner', type: 'way', role: 'inner' },
      ]),
    )
    const reversed = graphOf(
      ...square,
      outer,
      ...inner,
      innerWay,
      multipolygon([
        { id: 'w-inner', type: 'way', role: 'inner' },
        { id: 'w-outer', type: 'way', role: 'outer' },
      ]),
    )
    const first = validateChanged(rule, ordered, ['r-1'])
    const second = validateChanged(rule, reversed, ['r-1'])
    expect(first).toHaveLength(2)
    expect(new Set(first.map((issue) => issue.id)).size).toBe(2)
    expect(first.map((issue) => issue.id).sort()).toEqual(second.map((issue) => issue.id).sort())
    const ys = first.map((issue) => issue.loc?.[1] ?? NaN).sort((a, b) => a - b)
    expect(ys[0]).toBeCloseTo(0.25)
    expect(ys[1]).toBeCloseTo(0.75)
  })

  it('has no issue for rings that only share a node', () => {
    // a triangle inside the square that starts and ends at the corner (0, 0) of the outer ring
    const graph = graphOf(
      ...square,
      outer,
      node('n-d1', 0.5, 0.2),
      node('n-d2', 0.2, 0.5),
      way('w-inner', ['n-a1', 'n-d1', 'n-d2', 'n-a1'], {}),
      multipolygon([
        { id: 'w-outer', type: 'way', role: 'outer' },
        { id: 'w-inner', type: 'way', role: 'inner' },
      ]),
    )
    expect(validateChanged(rule, graph, ['r-1'])).toHaveLength(0)
  })

  it('has no issue for a way that touches the outer ring at an end node', () => {
    // the end node (1, 0.5) lies on the east edge of the outer ring, but the two ways share no node
    const graph = graphOf(
      ...square,
      outer,
      node('n-b1', 0.5, 0.5),
      node('n-b2', 1, 0.5),
      way('w-inner', ['n-b1', 'n-b2'], {}),
      multipolygon([
        { id: 'w-outer', type: 'way', role: 'outer' },
        { id: 'w-inner', type: 'way', role: 'inner' },
      ]),
    )
    expect(validateChanged(rule, graph, ['r-1'])).toHaveLength(0)
  })

  it('has no issue for a valid multipolygon: an inner ring inside the outer one', () => {
    const graph = graphOf(
      ...square,
      outer,
      node('n-e1', 0.25, 0.25),
      node('n-e2', 0.75, 0.25),
      node('n-e3', 0.75, 0.75),
      node('n-e4', 0.25, 0.75),
      way('w-inner', ['n-e1', 'n-e2', 'n-e3', 'n-e4', 'n-e1'], {}),
      multipolygon([
        { id: 'w-outer', type: 'way', role: 'outer' },
        { id: 'w-inner', type: 'way', role: 'inner' },
      ]),
    )
    expect(validateChanged(rule, graph, ['r-1'])).toHaveLength(0)
  })

  it('has no issue when one way is listed twice: it is one ring', () => {
    const graph = graphOf(
      ...square,
      outer,
      multipolygon([
        { id: 'w-outer', type: 'way', role: 'outer' },
        { id: 'w-outer', type: 'way', role: 'outer' },
      ]),
    )
    expect(validateChanged(rule, graph, ['r-1'])).toHaveLength(0)
  })

  it('has no issue for an incomplete multipolygon: the missing ways are not compared', () => {
    const graph = graphOf(
      ...square,
      outer,
      multipolygon([
        { id: 'w-outer', type: 'way', role: 'outer' },
        { id: 'w-missing', type: 'way', role: 'inner' },
      ]),
    )
    expect(validateChanged(rule, graph, ['r-1'])).toHaveLength(0)
  })

  it('has no issue for a route whose members cross: only multipolygons are checked', () => {
    const graph = graphOf(
      ...square,
      outer,
      node('n-b1', 0.5, 0.5),
      node('n-b2', 1.5, 0.5),
      way('w-inner', ['n-b1', 'n-b2'], {}),
      relation(
        'r-1',
        [
          { id: 'w-outer', type: 'way', role: 'outer' },
          { id: 'w-inner', type: 'way', role: 'inner' },
        ],
        { type: 'route' },
      ),
    )
    expect(validateChanged(rule, graph, ['r-1'])).toHaveLength(0)
  })

  it('finds the crossings of a large multipolygon (about 2,000 segments) in well under 50 ms', () => {
    // An outer circle of 1,000 nodes and an inner circle of 1,000 nodes, with one node of the inner circle pushed out
    // through the outer one: two crossings, and the rest of the 2,000 segments is compared with the index
    const count = 1000
    const entities = []
    const outerNodes: string[] = []
    const innerNodes: string[] = []
    for (let k = 0; k < count; k++) {
      const angle = (2 * Math.PI * k) / count
      const outerId = `n-o${k}`
      entities.push(node(outerId, Math.cos(angle), Math.sin(angle)))
      outerNodes.push(outerId)
      const radius = k === 0 ? 1.2 : 0.5
      const innerId = `n-i${k}`
      entities.push(node(innerId, radius * Math.cos(angle), radius * Math.sin(angle)))
      innerNodes.push(innerId)
    }
    const outerWay = way('w-outer', [...outerNodes, outerNodes[0] ?? ''], {})
    const innerWay = way('w-inner', [...innerNodes, innerNodes[0] ?? ''], {})
    const graph = graphOf(
      ...entities,
      outerWay,
      innerWay,
      multipolygon([
        { id: 'w-outer', type: 'way', role: 'outer' },
        { id: 'w-inner', type: 'way', role: 'inner' },
      ]),
    )

    const times: number[] = []
    let issues = validateChanged(rule, graph, ['r-1'])
    for (let run = 0; run < 3; run++) {
      const start = performance.now()
      issues = validateChanged(rule, graph, ['r-1'])
      times.push(performance.now() - start)
    }
    const best = Math.min(...times)
    console.log(
      `multipolygon_crossing: ${2 * count} segments, ${issues.length} crossings, ${best.toFixed(2)} ms (best of 3)`,
    )
    expect(issues).toHaveLength(2)
    expect(best).toBeLessThan(50)
  })
})

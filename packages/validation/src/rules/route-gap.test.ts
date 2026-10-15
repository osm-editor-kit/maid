import { describe, expect, it } from 'bun:test'
import { actionDeleteWay, Difference, Graph, OsmRelation } from '@osm-editor-kit/maid-model'
import { graphOf, node, relation, validateChanged, way } from '../id-test-helpers.ts'
import { createValidator, runContext } from '../validator.ts'
import { routeGap, routeJoins } from './route-gap.ts'

// Nodes n1 to n5 lie on one line, from west to east, so a gap has a place to be drawn.
function line() {
  return [
    node('n1', 0, 0),
    node('n2', 0.001, 0),
    node('n3', 0.002, 0),
    node('n4', 0.003, 0),
    node('n5', 0.004, 0),
  ]
}

const member = (id: string, role = '') => ({ id, type: 'way' as const, role })

describe('route_gap', () => {
  it('has no issue when consecutive ways share a node, in either direction', () => {
    const graph = graphOf(
      ...line(),
      way('w-1', ['n1', 'n2']),
      way('w-2', ['n3', 'n2']),
      way('w-3', ['n3', 'n4']),
      relation('r-1', [member('w-1'), member('w-2'), member('w-3')], {
        type: 'route',
        route: 'bus',
      }),
    )
    expect(validateChanged(routeGap, graph, ['r-1'])).toEqual([])
  })

  it('reports one gap, at the gap, with the relation and the two ways', () => {
    const graph = graphOf(
      ...line(),
      way('w-1', ['n1', 'n2']),
      way('w-2', ['n3', 'n4']),
      relation('r-1', [member('w-1'), member('w-2')], { type: 'route', route: 'bus' }),
    )
    const issues = validateChanged(routeGap, graph, ['r-1'])
    expect(issues.map((issue) => issue.id)).toEqual(['route_gap:r-1:w-1:w-2'])
    const [issue] = issues
    expect(issue?.rule).toBe('route_gap')
    expect(issue?.severity).toBe('warning')
    expect(issue?.entityIds).toEqual(['r-1', 'w-1', 'w-2'])
    expect(issue?.fixes).toEqual([])
    // the midpoint of the two nearest ends, n2 (lon 0.001) and n3 (lon 0.002)
    expect(issue?.loc?.[0]).toBeCloseTo(0.0015)
    expect(issue?.loc?.[1]).toBeCloseTo(0)
  })

  it('ignores stops and platforms between two ways that join, and the nodes of a route', () => {
    const graph = graphOf(
      ...line(),
      node('stop', 0.01, 0.01),
      way('w-1', ['n1', 'n2']),
      way('p-1', ['n4', 'n5']),
      way('w-2', ['n2', 'n3']),
      relation(
        'r-1',
        [
          member('w-1'),
          member('p-1', 'platform'),
          member('w-2'),
          { id: 'stop', type: 'node', role: 'stop' },
        ],
        { type: 'route', route: 'bus' },
      ),
    )
    expect(validateChanged(routeGap, graph, ['r-1'])).toEqual([])
  })

  it('does not judge a pair with a member that is not loaded', () => {
    const graph = graphOf(
      ...line(),
      way('w-1', ['n1', 'n2']),
      relation('r-1', [member('w-1'), member('w-missing')], { type: 'route', route: 'bus' }),
    )
    expect(validateChanged(routeGap, graph, ['r-1'])).toEqual([])
    const route = graph.hasEntity('r-1')
    if (!(route instanceof OsmRelation)) throw new Error('the relation is missing')
    expect(routeJoins(graph, route).map((entry) => entry.join)).toEqual(['unknown'])
  })

  it('checks only type=route, not a route_master or another relation', () => {
    const graph = graphOf(
      ...line(),
      way('w-1', ['n1', 'n2']),
      way('w-2', ['n3', 'n4']),
      relation('r-1', [member('w-1'), member('w-2')], { type: 'route_master' }),
    )
    expect(validateChanged(routeGap, graph, ['r-1'])).toEqual([])
  })

  it("makes a gap that an edit creates the edits' issue", () => {
    const base = graphOf(
      ...line(),
      way('w-1', ['n1', 'n2']),
      way('w-2', ['n2', 'n3']),
      way('w-3', ['n3', 'n4']),
      relation('r-1', [member('w-1'), member('w-2'), member('w-3')], {
        type: 'route',
        route: 'bus',
      }),
    )
    // the edit moves the start of w-3 away from n3: the gap is new, and it names the changed way
    const head = new Graph(base).replace(way('w-3', ['n4', 'n5']))
    const validator = createValidator([routeGap], { showExisting: () => false })
    validator.update({ base, head, changes: new Difference(base, head).changes }, [])
    expect(validator.issues().map((issue) => issue.id)).toEqual(['route_gap:r-1:w-2:w-3'])
    expect(validator.existingIssues()).toEqual([])
  })

  it("makes the gap that a deleted way leaves in its route the edits' issue", () => {
    const base = graphOf(
      ...line(),
      way('w-1', ['n1', 'n2']),
      way('w-2', ['n2', 'n3']),
      way('w-3', ['n3', 'n4']),
      relation('r-1', [member('w-1'), member('w-2'), member('w-3')], {
        type: 'route',
        route: 'bus',
      }),
    )
    // deleting w-2 removes it from the route too (actionDeleteWay): w-1 and w-3 no longer meet
    const head = actionDeleteWay('w-2')(new Graph(base))
    const validator = createValidator([routeGap], { showExisting: () => false })
    validator.update({ base, head, changes: new Difference(base, head).changes }, [])
    expect(validator.issues().map((issue) => issue.id)).toEqual(['route_gap:r-1:w-1:w-3'])
    expect(validator.existingIssues()).toEqual([])
  })

  it('keeps an old gap existing when an edit next to it is checked', () => {
    // the gap between w-2 and w-3 is in the loaded data already; the edit only changes the name of w-1
    const base = graphOf(
      ...line(),
      way('w-1', ['n1', 'n2']),
      way('w-2', ['n2', 'n3']),
      way('w-3', ['n4', 'n5']),
      relation('r-1', [member('w-1'), member('w-2'), member('w-3')], {
        type: 'route',
        route: 'bus',
      }),
    )
    const head = new Graph(base).replace(way('w-1', ['n1', 'n2'], { name: 'edited' }))
    const validator = createValidator([routeGap], { showExisting: () => false })
    validator.checkExisting(base, ['r-1'], [])
    expect(validator.existingIssues().map((issue) => issue.id)).toEqual(['route_gap:r-1:w-2:w-3'])
    validator.update({ base, head, changes: new Difference(base, head).changes }, [])
    expect(validator.issues()).toEqual([])
    expect(validator.existingIssues().map((issue) => issue.id)).toEqual(['route_gap:r-1:w-2:w-3'])
  })

  it('validates a route of 2000 ways in well under 20 ms', () => {
    const count = 2000
    const nodes = Array.from({ length: count + 1 }, (_, i) => node(`p${i}`, i * 0.0001, 0))
    const ways = Array.from({ length: count }, (_, i) => way(`w${i}`, [`p${i}`, `p${i + 1}`]))
    const members = ways.map((w) => member(w.id, 'forward'))
    const graph = graphOf(
      ...nodes,
      ...ways,
      relation('r-big', members, { type: 'route', route: 'bicycle' }),
    )
    const big = graph.hasEntity('r-big')
    if (!big) throw new Error('the relation is missing')
    const context = runContext(graph, [], new Set(['r-big']))
    // the first run is warm-up; the median of the rest is the number
    routeGap.validate(big, context)
    const times: number[] = []
    let found: unknown[] = []
    for (let run = 0; run < 7; run++) {
      const start = performance.now()
      found = routeGap.validate(big, context)
      times.push(performance.now() - start)
    }
    times.sort((a, b) => a - b)
    const median = times[3] ?? Number.POSITIVE_INFINITY
    expect(found).toEqual([])
    expect(median).toBeLessThan(20)
  })
})

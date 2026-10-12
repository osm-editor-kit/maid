// Adopted from iD test/spec/validations/disconnected_way.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { validateChanged, graphOf, node, relation, way } from '../id-test-helpers.ts'
import { disconnectedWay } from './disconnected-way.ts'

// Covered by validation.test.ts, not repeated here: "flags disconnected highway" (reports a lone
// residential road) and "ignores highway with connected entrance vertex" (is not reported for a
// footway that reaches an entrance).

/** iD's createWay: two nodes, one way with these tags, all changed */
function createWay(tags: Record<string, string> = {}) {
  const graph = graphOf(node('n-1', 4, 4), node('n-2', 4, 5), way('w-1', ['n-1', 'n-2'], tags))
  return { graph, ids: ['n-1', 'n-2', 'w-1'] }
}

/** iD's createConnectingWays: a node shared by two ways, all changed */
function createConnectingWays(tags1: Record<string, string>, tags2: Record<string, string>) {
  const graph = graphOf(
    node('n-1', 4, 4),
    node('n-2', 4, 5),
    node('n-3', 5, 5),
    way('w-1', ['n-1', 'n-2'], tags1),
    way('w-2', ['n-1', 'n-3'], tags2),
  )
  return { graph, ids: ['n-1', 'n-2', 'n-3', 'w-1', 'w-2'] }
}

describe('iD.validations.disconnected_way', () => {
  const rule = disconnectedWay

  it('has no errors on init', () => {
    expect(validateChanged(rule, graphOf(), [])).toHaveLength(0)
  })

  it('flags highway connected only to service area', () => {
    const { graph, ids } = createConnectingWays(
      { highway: 'unclassified' },
      { highway: 'services' },
    )
    const issues = validateChanged(rule, graph, ids)
    expect(issues).toHaveLength(1)
    const issue = issues[0]
    expect(issue?.rule).toEqual('disconnected_way')
    expect(issue?.severity).toEqual('warning')
    expect(issue?.entityIds).toHaveLength(1)
    expect(issue?.entityIds[0]).toEqual('w-1')
  })

  it('flags disconnected highway multipolygon', () => {
    // The multipolygon is the feature: its untagged outer way is not one of its own
    const graph = graphOf(
      node('n-1', 4, 4),
      node('n-2', 4, 5),
      way('w-1', ['n-1', 'n-2']),
      relation('r-1', [{ id: 'w-1', type: 'way', role: 'outer' }], {
        highway: 'pedestrian',
        type: 'multipolygon',
      }),
    )
    const issues = validateChanged(rule, graph, ['n-1', 'n-2', 'w-1', 'r-1'])
    expect(issues).toHaveLength(1)
    const issue = issues[0]
    expect(issue?.rule).toEqual('disconnected_way')
    expect(issue?.severity).toEqual('warning')
    expect(issue?.entityIds).toHaveLength(1)
    expect(issue?.entityIds[0]).toEqual('r-1')
  })

  it('ignores disconnected golf walking path', () => {
    const { graph, ids } = createWay({ highway: 'footway', golf: 'path' })
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('ignores disconnected golf cartpath', () => {
    const { graph, ids } = createWay({ highway: 'path', golf: 'cartpath' })
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('considers golf path as routable when checking connectivity of other paths', () => {
    // iD's test adds the entities over an earlier createWay: the final graph is this one
    const graph = graphOf(
      node('n-1', 4, 4, { entrance: 'yes' }),
      node('n-2', 4, 5),
      node('n-3', 5, 5),
      way('w-1', ['n-1', 'n-2'], { highway: 'path', golf: 'cartpath' }),
      way('w-2', ['n-2', 'n-3'], { highway: 'unclassified' }),
    )
    expect(validateChanged(rule, graph, ['n-1', 'n-2', 'n-3', 'w-1', 'w-2'])).toHaveLength(0)
  })

  it('ignores disconnected aerialway', () => {
    const { graph, ids } = createWay({ aerialway: 'gondola' })
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('considers aerialway as routable when checking connectivity of other paths', () => {
    const graph = graphOf(
      node('n-1', 4, 4, { entrance: 'yes' }),
      node('n-2', 4, 5),
      node('n-3', 5, 5),
      way('w-1', ['n-1', 'n-2'], { aerialway: ' \tgondola' }),
      way('w-2', ['n-2', 'n-3'], { highway: 'corridor' }),
    )
    expect(validateChanged(rule, graph, ['n-1', 'n-2', 'n-3', 'w-1', 'w-2'])).toHaveLength(0)
  })
})

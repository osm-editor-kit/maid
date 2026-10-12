// Adopted from iD test/spec/validations/almost_junction.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { Graph, OsmWay } from '@osm-editor-kit/maid-model'
import type { Action } from '@osm-editor-kit/maid-model'
import { graphOf, node, validateChanged, way } from '../id-test-helpers.ts'
import type { Fix } from '../types.ts'
import { almostJunction } from './almost-junction.ts'

// Maid's Issue has no `type` or `subtype`: the rule is `issue.rule`. The fixes are `issue.fixes`,
// and iD's `issue.fixes(context)` also lists "Ignore this issue" for a warning: Maid has no ignore
// fix (F-validations-22), so a count of fixes that includes it is parked.

/** Applies the actions of a fix as the editor does, on a head copy of the graph */
function applyFix(graph: Graph, fix: Fix | undefined): Graph {
  if (!fix) throw new Error('no fix')
  const actions: Action[] = fix.actions(new Graph(graph))
  return actions.reduce<Graph>((head, action) => action(head), new Graph(graph))
}

describe('iD.validations.almost_junction', () => {
  const rule = almostJunction

  it('has no errors on init', () => {
    const issues = validateChanged(rule, graphOf(), [])
    expect(issues).toHaveLength(0)
  })

  // needs F-validations-21, and F-validations-22 for the fix count
  it.todo('flags horizontal and vertical road closer than threshold', () => {})

  // needs F-validations-21, and F-validations-22 for the fix count
  it.todo('flags horizontal and tilted road closer than threshold', () => {})

  // needs F-validations-21
  it.todo('ignores horizontal and vertical road further than threshold', () => {})

  // needs F-validations-21
  it.todo('ignores horizontal and vertical road closer than threshold, but with noexit tag', () => {})

  // needs F-validations-21
  it.todo('ignores two horizontal roads closer than threshold', () => {})

  // needs F-validations-21
  it.todo('joins close endpoints if insignificant angle change', () => {})

  // needs F-validations-21
  it.todo("won't join close endpoints if significant angle change", () => {})

  it('joins close endpoints of the same way', () => {
    // Square path that ends within 4.25m of itself and change of angle <9°
    const graph = graphOf(
      node('n-1', 0, 22.4427453),
      node('n-2', 0, 22.4429811),
      node('n-3', 0.0001923, 22.4429811),
      node('n-4', 0.0001923, 22.4427523),
      node('n-5', 0.0000134, 22.4427523),
      way('w-1', ['n-1', 'n-2', 'n-3', 'n-4', 'n-5'], { highway: 'path' }),
    )
    const issues = validateChanged(rule, graph, ['n-1', 'n-2', 'n-3', 'n-4', 'n-5', 'w-1'])
    expect(issues).toHaveLength(1)
    const issue = issues[0]
    expect(issue?.rule).toEqual('almost_junction')
    expect(issue?.message).toContain('ends very close to itself')
    expect(issue?.entityIds).toHaveLength(3)
    expect(issue?.entityIds[0]).toEqual('w-1')
    expect(issue?.entityIds[1]).toEqual('n-5')
    expect(issue?.entityIds[2]).toEqual('w-1')

    const fixed = applyFix(graph, issue?.fixes[0])
    const w = fixed.hasEntity('w-1')
    expect(w instanceof OsmWay && w.nodes[0] === w.nodes[w.nodes.length - 1]).toBe(true)
  })

  // needs F-validations-21
  it.todo('joins to close endpoint with smaller angle change', () => {})
})

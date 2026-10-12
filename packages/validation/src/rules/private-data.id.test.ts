// Adopted from iD test/spec/validations/private_data.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { Graph } from '@osm-editor-kit/maid-model'
import type { Action } from '@osm-editor-kit/maid-model'
import { graphOf, node, validateChanged, way } from '../id-test-helpers.ts'
import { privateData } from './private-data.ts'

// Maid's Issue has no `type`: the rule is `issue.rule`.

/** iD's createWay: three nodes and one way with these tags, all of them changed */
function createWay(tags: Record<string, string>) {
  const graph = graphOf(
    node('n-1', 4, 4),
    node('n-2', 4, 5),
    node('n-3', 5, 5),
    way('w-1', ['n-1', 'n-2', 'n-3'], tags),
  )
  return { graph, ids: ['n-1', 'n-2', 'n-3', 'w-1'] }
}

describe('iD.validations.private_data', () => {
  const rule = privateData

  it('has no errors on init', () => {
    const issues = validateChanged(rule, graphOf(), [])
    expect(issues).toHaveLength(0)
  })

  it('ignores way with no tags', () => {
    const { graph, ids } = createWay({})
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('ignores way with phone tag', () => {
    const { graph, ids } = createWay({ phone: '123-456-7890' })
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('ignores generic building with phone tag', () => {
    const { graph, ids } = createWay({ building: 'yes', phone: '123-456-7890' })
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('ignores guest house with phone tag', () => {
    const { graph, ids } = createWay({
      building: 'house',
      phone: '123-456-7890',
      tourism: 'guest_house',
    })
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('flags house with phone tag', () => {
    const { graph, ids } = createWay({ building: 'house', phone: '123-456-7890' })
    const issues = validateChanged(rule, graph, ids)
    expect(issues).toHaveLength(1)
    const issue = issues[0]
    expect(issue?.rule).toEqual('private_data')
    expect(issue?.entityIds).toHaveLength(1)
    expect(issue?.entityIds[0]).toEqual('w-1')
  })

  // Maid addition, not in iD's spec: the fix removes the personal tags and keeps the others.
  it('offers to remove the personal tags and keeps the rest', () => {
    const { graph, ids } = createWay({
      building: 'house',
      phone: '123-456-7890',
      email: 'a@example.org',
      addr: 'kept',
    })
    const [issue] = validateChanged(rule, graph, ids)
    expect(issue?.fixes.map((fix) => fix.label)).toEqual(['Remove phone, email'])
    const fix = issue?.fixes[0]
    if (!fix) throw new Error('no fix')
    const actions: Action[] = fix.actions(new Graph(graph))
    const fixed = actions.reduce<Graph>((g, action) => action(g), new Graph(graph))
    expect(fixed.hasEntity('w-1')?.tags).toEqual({ building: 'house', addr: 'kept' })
  })
})

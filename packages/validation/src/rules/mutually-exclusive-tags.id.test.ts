// Adopted from iD test/spec/validations/mutually_exclusive_tags.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { Graph } from '@osm-editor-kit/maid-model'
import type { Action } from '@osm-editor-kit/maid-model'
import { graphOf, node, validateChanged } from '../id-test-helpers.ts'
import { mutuallyExclusiveTags } from './mutually-exclusive-tags.ts'

// Maid's Issue has no `type` or `subtype`: the rule is `issue.rule`, and iD's subtype is the
// message: "default" is "Has both <tag1> and <tag2>, which exclude each other", "same_value" is
// "<tag1> repeats the value of <tag2>, ...".

/** iD's createNode: one node, changed, with these tags */
function createNode(tags: Record<string, string>) {
  return graphOf(node('n-1', 4, 4, tags))
}

describe('iD.validations.mutually_exclusive_tags', () => {
  const rule = mutuallyExclusiveTags

  it('has no errors on init', () => {
    const issues = validateChanged(rule, graphOf(), [])
    expect(issues).toHaveLength(0)
  })

  it('has no errors on good tags', () => {
    const graph = createNode({ name: 'Trader Joe', 'not:name': 'Trader Jane' })
    const issues = validateChanged(rule, graph, ['n-1'])
    expect(issues).toHaveLength(0)
  })

  it('flags mutually exclusive tags', () => {
    const graph = createNode({ name: 'Trader Joe', noname: 'yes' })
    const issues = validateChanged(rule, graph, ['n-1'])
    expect(issues).toHaveLength(1)
    const issue = issues[0]
    expect(issue?.rule).toEqual('mutually_exclusive_tags')
    expect(issue?.message).toEqual('Has both noname and name, which exclude each other')
    expect(issue?.severity).toEqual('warning')
    expect(issue?.entityIds).toHaveLength(1)
    expect(issue?.entityIds[0]).toEqual('n-1')
  })

  it('flags feature with a mutually exclusive `not:name` value', () => {
    const graph = createNode({ shop: 'supermarket', name: 'Lous', 'not:name': 'Lous' })
    const issues = validateChanged(rule, graph, ['n-1'])
    expect(issues).toHaveLength(1)
    const issue = issues[0]
    expect(issue?.rule).toEqual('mutually_exclusive_tags')
    expect(issue?.message).toEqual(
      'not:name repeats the value of name, so the feature says it is not called that',
    )
    expect(issue?.severity).toEqual('warning')
    expect(issue?.entityIds).toHaveLength(1)
    expect(issue?.entityIds[0]).toEqual('n-1')
  })

  it('flags feature with a mutually exclusive semicolon-separated `not:name` value', () => {
    const graph = createNode({
      shop: 'supermarket',
      name: 'Lous',
      'not:name': "Louis';Lous;Louis's",
    })
    const issues = validateChanged(rule, graph, ['n-1'])
    expect(issues).toHaveLength(1)
    const issue = issues[0]
    expect(issue?.rule).toEqual('mutually_exclusive_tags')
    expect(issue?.message).toEqual(
      'not:name repeats the value of name, so the feature says it is not called that',
    )
    expect(issue?.severity).toEqual('warning')
    expect(issue?.entityIds).toHaveLength(1)
    expect(issue?.entityIds[0]).toEqual('n-1')
  })

  // Maid addition, not in iD's spec: each fix removes exactly one of the two tags.
  it('offers to remove either tag of the pair, and removes only that one', () => {
    const graph = createNode({ name: 'Trader Joe', noname: 'yes', shop: 'supermarket' })
    const [issue] = validateChanged(rule, graph, ['n-1'])
    expect(issue?.fixes.map((fix) => fix.label)).toEqual(['Remove noname', 'Remove name'])
    const fix = issue?.fixes[1]
    if (!fix) throw new Error('no fix')
    const actions: Action[] = fix.actions(new Graph(graph))
    const fixed = actions.reduce<Graph>((g, action) => action(g), new Graph(graph))
    expect(fixed.hasEntity('n-1')?.tags).toEqual({ noname: 'yes', shop: 'supermarket' })
  })
})

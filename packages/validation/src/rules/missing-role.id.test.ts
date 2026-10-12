// Adopted from iD test/spec/validations/missing_role.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { graphOf, node, relation, validateChanged, way } from '../id-test-helpers.ts'
import { missingRole } from './missing-role.ts'

// Maid's Issue has no `type`: the rule is `issue.rule`. iD's null role is the empty string here.

/** iD's createWay: two nodes and one way with these tags, all of them changed */
function createWay(tags: Record<string, string>) {
  const graph = graphOf(node('n-1', 4, 4), node('n-2', 4, 5), way('w-1', ['n-1', 'n-2'], tags))
  return { graph, ids: ['n-1', 'n-2', 'w-1'] }
}

/** iD's createRelation: three nodes, a closed way and a relation that has the way as its member */
function createRelation(tags: Record<string, string>, role: string) {
  const graph = graphOf(
    node('n-1', 4, 4),
    node('n-2', 4, 5),
    node('n-3', 5, 5),
    way('w-1', ['n-1', 'n-2', 'n-3', 'n-1']),
    relation('r-1', [{ id: 'w-1', type: 'way', role }], tags),
  )
  return { graph, ids: ['n-1', 'n-2', 'n-3', 'w-1', 'r-1'] }
}

describe('iD.validations.missing_role', () => {
  const rule = missingRole

  it('has no errors on init', () => {
    const issues = validateChanged(rule, graphOf(), [])
    expect(issues).toHaveLength(0)
  })

  it('ignores way with no relations', () => {
    const { graph, ids } = createWay({})
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('ignores way with null role in non-multipolygon relation', () => {
    const { graph, ids } = createRelation({ type: 'boundary' }, '')
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('ignores way with outer role in multipolygon', () => {
    const { graph, ids } = createRelation({ type: 'multipolygon' }, 'outer')
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('ignores way with inner role in multipolygon', () => {
    const { graph, ids } = createRelation({ type: 'multipolygon' }, 'inner')
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('flags way with null role in multipolygon', () => {
    const { graph, ids } = createRelation({ type: 'multipolygon' }, '')
    const issues = validateChanged(rule, graph, ids)
    expect(issues).toHaveLength(2)
    expect(issues[0]?.id).toEqual(issues[1]?.id)
    const issue = issues[0]
    expect(issue?.rule).toEqual('missing_role')
    expect(issue?.entityIds).toHaveLength(2)
    expect(issue?.entityIds[0]).toEqual('w-1')
    expect(issue?.entityIds[1]).toEqual('r-1')
  })

  it('flags way with whitespace string role in multipolygon', () => {
    const { graph, ids } = createRelation({ type: 'multipolygon' }, '   ')
    const issues = validateChanged(rule, graph, ids)
    expect(issues).toHaveLength(2)
    expect(issues[0]?.id).toEqual(issues[1]?.id)
    const issue = issues[0]
    expect(issue?.rule).toEqual('missing_role')
    expect(issue?.entityIds).toHaveLength(2)
    expect(issue?.entityIds[0]).toEqual('w-1')
    expect(issue?.entityIds[1]).toEqual('r-1')
  })
})

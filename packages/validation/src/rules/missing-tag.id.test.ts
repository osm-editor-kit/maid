// Adopted from iD test/spec/validations/missing_tag.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { validateChanged, graphOf, node, relation, way } from '../id-test-helpers.ts'
import { missingTag } from './missing-tag.ts'

// Maid's Issue has no `type` or `subtype`: the rule is `issue.rule`, and iD's subtype is the
// message ("has no tags", "has no descriptive tags", "has no type", "is highway=road").
// Covered by validation.test.ts, not repeated here: "flags no tags" (reports an untagged line),
// "flags no descriptive tags" (reports a line that has only a source tag), "flags no type tag on
// relation" (reports a relation without a type), "flags highway=road" (reports a road with the
// vague highway=road).

/** iD's createWay: two nodes and one way with these tags, all of them changed */
function createWay(tags: Record<string, string> = {}) {
  const graph = graphOf(node('n-1', 4, 4), node('n-2', 4, 5), way('w-1', ['n-1', 'n-2'], tags))
  return { graph, ids: ['n-1', 'n-2', 'w-1'] }
}

/** iD's createRelation: three nodes, a closed way and a relation around it */
function createRelation(tags: Record<string, string>) {
  const graph = graphOf(
    node('n-1', 4, 4),
    node('n-2', 4, 5),
    node('n-3', 5, 5),
    way('w-1', ['n-1', 'n-2', 'n-3', 'n-1']),
    relation('r-1', [{ id: 'w-1', type: 'way', role: '' }], tags),
  )
  return { graph, ids: ['n-1', 'n-2', 'n-3', 'w-1', 'r-1'] }
}

describe('iD.validations.missing_tag', () => {
  const rule = missingTag

  it('has no errors on init', () => {
    const issues = validateChanged(rule, graphOf(), [])
    expect(issues).toHaveLength(0)
  })

  it('ignores way with descriptive tags', () => {
    const { graph, ids } = createWay({ leisure: 'park' })
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('ignores multipolygon with descriptive tags', () => {
    const { graph, ids } = createRelation({ leisure: 'park', type: 'multipolygon' })
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('flags no descriptive tags on multipolygon', () => {
    const { graph, ids } = createRelation({
      name: 'City Park',
      source: 'Bing',
      type: 'multipolygon',
    })
    const issues = validateChanged(rule, graph, ids)
    expect(issues).toHaveLength(1)
    const issue = issues[0]
    expect(issue?.rule).toEqual('missing_tag')
    expect(issue?.message).toEqual('This relation has no descriptive tags')
    expect(issue?.entityIds).toHaveLength(1)
    expect(issue?.entityIds[0]).toEqual('r-1')
  })

  it('ignores highway with classification', () => {
    const { graph, ids } = createWay({ highway: 'primary' })
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })
})

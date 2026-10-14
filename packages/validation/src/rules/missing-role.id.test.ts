// Adopted from iD test/spec/validations/missing_role.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { Graph } from '@osm-editor-kit/maid-model'
import type { Action } from '@osm-editor-kit/maid-model'
import {
  graphOf,
  node,
  relation,
  schemaPresets,
  uniqueById,
  validateChanged,
  way,
} from '../id-test-helpers.ts'
import type { Fix, Issue, RelationRoles } from '../types.ts'
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

/** The schema of iD's multipolygon fixture in PR 12990's test: inner and outer, for a line or an area */
const multipolygonRoles: RelationRoles = {
  inner: { label: 'Inner', member: { role: 'inner', geometry: ['line', 'area'] } },
  outer: { label: 'Outer', member: { role: 'outer', geometry: ['line', 'area'] } },
}

/** A boundary whose roles depend on the member: a vertex is the admin centre, an area a subarea */
const boundaryRoles: RelationRoles = {
  admin_centre: { label: 'Admin centre', member: { role: 'admin_centre', geometry: ['vertex'] } },
  subarea: { label: 'Subarea', member: { role: 'subarea', geometry: ['area'] } },
}

/** The roles of the relation's schema, by its type */
function rolesByType(roles: Record<string, RelationRoles>) {
  return (tags: Record<string, string>) => roles[tags.type ?? ''] ?? {}
}

const withSchema = schemaPresets(
  rolesByType({ multipolygon: multipolygonRoles, boundary: boundaryRoles }),
)

/** Applies the actions of a fix on a copy of the graph, as the editor does: one undo step */
function applyFix(graph: Graph, fix: Fix | undefined): Graph {
  if (!fix) throw new Error('the issue has no such fix')
  const actions: Action[] = fix.actions(new Graph(graph))
  return actions.reduce<Graph>((head, action) => action(head), new Graph(graph))
}

function labelsOf(issue: Issue | undefined) {
  return issue?.fixes.map((fix) => fix.label)
}

describe('iD.validations.missing_role with the relation schema', () => {
  const rule = missingRole

  it('flags a way without a role in a multipolygon, with the roles and the removal as fixes', () => {
    const { graph, ids } = createRelation({ type: 'multipolygon' }, '')
    const issues = uniqueById(validateChanged(rule, graph, ids, withSchema))
    expect(issues).toHaveLength(1)
    expect(labelsOf(issues[0])).toEqual(['Set as Inner', 'Set as Outer', 'Remove from relation'])
  })

  it('ignores a way with a role in a multipolygon with the schema', () => {
    const { graph, ids } = createRelation({ type: 'multipolygon' }, 'inner')
    expect(validateChanged(rule, graph, ids, withSchema)).toHaveLength(0)
  })

  it('sets the role of the member, and keeps its id and type', () => {
    const { graph, ids } = createRelation({ type: 'multipolygon' }, '')
    const issue = uniqueById(validateChanged(rule, graph, ids, withSchema))[0]
    const after = applyFix(graph, issue?.fixes[1])
    const members = after.hasEntity('r-1') as unknown as { members: unknown[] }
    expect(members.members).toEqual([{ id: 'w-1', type: 'way', role: 'outer' }])
  })

  it('removes the member with the removal fix', () => {
    const { graph, ids } = createRelation({ type: 'multipolygon' }, '')
    const issue = uniqueById(validateChanged(rule, graph, ids, withSchema))[0]
    const after = applyFix(graph, issue?.fixes[2])
    // the relation had one member: as with iD's actionDeleteMember, a relation left with no members is deleted
    expect(after.hasEntity('r-1')).toBeUndefined()
    expect(after.hasEntity('w-1')).toBeDefined()
  })

  it('keeps the outer and inner fixes of a multipolygon when the presets give it no schema', () => {
    const { graph, ids } = createRelation({ type: 'multipolygon' }, '')
    const issues = uniqueById(
      validateChanged(
        rule,
        graph,
        ids,
        schemaPresets(() => ({})),
      ),
    )
    expect(labelsOf(issues[0])).toEqual(['Set as outer', 'Set as inner', 'Remove from relation'])
  })

  it('checks a relation with a schema that is not a multipolygon, from the relation side', () => {
    const { graph } = createRelation({ type: 'boundary' }, '')
    const issues = uniqueById(validateChanged(rule, graph, ['r-1'], withSchema))
    expect(issues).toHaveLength(1)
    expect(issues[0]?.entityIds).toEqual(['w-1', 'r-1'])
    // the way is closed and has no tags: a line, so no role of the boundary is valid for it
    expect(labelsOf(issues[0])).toEqual(['Remove from relation'])
  })

  it('offers only the roles valid for the geometry of the member', () => {
    // a node in a way is a vertex: the admin centre fits, the subarea (an area) does not
    const graph = graphOf(
      node('n-1', 4, 4),
      node('n-2', 4, 5),
      node('n-3', 5, 5),
      way('w-1', ['n-1', 'n-2', 'n-3', 'n-1']),
      relation('r-1', [{ id: 'n-1', type: 'node', role: '' }], { type: 'boundary' }),
    )
    const issues = uniqueById(validateChanged(rule, graph, ['n-1', 'r-1'], withSchema))
    expect(issues).toHaveLength(1)
    expect(issues[0]?.entityIds).toEqual(['n-1', 'r-1'])
    expect(labelsOf(issues[0])).toEqual(['Set as Admin centre', 'Remove from relation'])
  })

  it('ignores a relation whose schema allows the empty role', () => {
    const allowsEmpty = schemaPresets(() => ({
      '': { label: '', member: { role: '' } },
      ...multipolygonRoles,
    }))
    const { graph, ids } = createRelation({ type: 'multipolygon' }, '')
    expect(validateChanged(rule, graph, ids, allowsEmpty)).toHaveLength(0)
  })

  it('ignores a relation with no schema that is not a multipolygon, even with presets', () => {
    const { graph, ids } = createRelation({ type: 'site' }, '')
    expect(
      validateChanged(
        rule,
        graph,
        ids,
        schemaPresets(() => ({})),
      ),
    ).toHaveLength(0)
  })
})

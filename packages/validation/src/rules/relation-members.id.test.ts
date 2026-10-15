// Written for Maid after iD's relation_members (duplicate_member subtype, PR 12994): iD's spec has no test file for it
// in that PR. The cases are the ones its code describes: no issue when duplicates are allowed or there is no schema,
// one issue per entity, one fix that keeps the first membership for one role, one fix per role for several roles.
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
import { relationMembers } from './relation-members.ts'

const rule = relationMembers

const roles: RelationRoles = {
  inner: { label: 'Inner', member: { role: 'inner' } },
  outer: { label: 'Outer', member: { role: 'outer' } },
}

/** Three nodes and two closed ways w-1 and w-2, as members of the multipolygon r-1 with these members */
function sceneWith(members: { id: string; type: 'way'; role: string }[]) {
  const graph = graphOf(
    node('n-1', 4, 4),
    node('n-2', 4, 5),
    node('n-3', 5, 5),
    way('w-1', ['n-1', 'n-2', 'n-3', 'n-1']),
    way('w-2', ['n-1', 'n-2', 'n-3', 'n-1']),
    relation('r-1', members, { type: 'multipolygon' }),
  )
  return { graph, ids: ['n-1', 'n-2', 'n-3', 'w-1', 'w-2', 'r-1'] }
}

/** Applies the actions of a fix on a copy of the graph, as the editor does: one undo step */
function applyFix(graph: Graph, fix: Fix | undefined): Graph {
  if (!fix) throw new Error('the issue has no such fix')
  const actions: Action[] = fix.actions(new Graph(graph))
  return actions.reduce<Graph>((head, action) => action(head), new Graph(graph))
}

/** The members of the relation after a fix, as `id:role` */
function membersAfter(graph: Graph, fix: Fix | undefined) {
  const after = applyFix(graph, fix).hasEntity('r-1') as unknown as {
    members: { id: string; role: string }[]
  }
  return after.members.map((member) => `${member.id}:${member.role}`)
}

describe('relation_members (duplicate_member)', () => {
  const sameRoleTwice = [
    { id: 'w-1', type: 'way' as const, role: 'outer' },
    { id: 'w-1', type: 'way' as const, role: 'outer' },
    { id: 'w-2', type: 'way' as const, role: 'inner' },
  ]
  const twoRoles = [
    { id: 'w-1', type: 'way' as const, role: 'inner' },
    { id: 'w-1', type: 'way' as const, role: 'outer' },
  ]

  it('has no issue on init', () => {
    expect(
      validateChanged(
        rule,
        graphOf(),
        [],
        schemaPresets(() => roles, false),
      ),
    ).toHaveLength(0)
  })

  it('has no issue when the schema allows duplicate members', () => {
    const { graph, ids } = sceneWith(sameRoleTwice)
    expect(
      validateChanged(
        rule,
        graph,
        ids,
        schemaPresets(() => roles, true),
      ),
    ).toHaveLength(0)
  })

  it('has no issue when the relation has no schema', () => {
    const { graph, ids } = sceneWith(sameRoleTwice)
    expect(
      validateChanged(
        rule,
        graph,
        ids,
        schemaPresets(() => ({}), false),
      ),
    ).toHaveLength(0)
  })

  it('has no issue without presets, which are not made yet', () => {
    const { graph, ids } = sceneWith(sameRoleTwice)
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('reports one issue for an entity that is a member twice with the same role, with one fix', () => {
    const { graph, ids } = sceneWith(sameRoleTwice)
    const issues = uniqueById(
      validateChanged(
        rule,
        graph,
        ids,
        schemaPresets(() => roles, false),
      ),
    )
    expect(issues).toHaveLength(1)
    const issue = issues[0] as Issue
    expect(issue.rule).toEqual('relation_members')
    expect(issue.severity).toEqual('warning')
    expect(issue.entityIds).toEqual(['w-1', 'r-1'])
    expect(issue.fixes.map((fix) => fix.label)).toEqual(['Remove from relation'])
  })

  it('the same-role fix keeps the first membership and deletes the others', () => {
    const { graph, ids } = sceneWith(sameRoleTwice)
    const issue = uniqueById(
      validateChanged(
        rule,
        graph,
        ids,
        schemaPresets(() => roles, false),
      ),
    )[0]
    expect(membersAfter(graph, issue?.fixes[0])).toEqual(['w-1:outer', 'w-2:inner'])
  })

  it('reports one issue with one fix per role when the duplicates have different roles', () => {
    const { graph, ids } = sceneWith(twoRoles)
    const issues = uniqueById(
      validateChanged(
        rule,
        graph,
        ids,
        schemaPresets(() => roles, false),
      ),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.fixes.map((fix) => fix.label)).toEqual([
      'Remove the "Inner" member',
      'Remove the "Outer" member',
    ])
  })

  it('a role fix deletes only the members with that role', () => {
    const { graph, ids } = sceneWith(twoRoles)
    const issue = uniqueById(
      validateChanged(
        rule,
        graph,
        ids,
        schemaPresets(() => roles, false),
      ),
    )[0]
    expect(membersAfter(graph, issue?.fixes[1])).toEqual(['w-1:inner'])
    expect(membersAfter(graph, issue?.fixes[0])).toEqual(['w-1:outer'])
  })

  it('keeps the id when the members change, and is reported on the relation, not on the way', () => {
    const { graph } = sceneWith(sameRoleTwice)
    const schema = schemaPresets(() => roles, false)
    // the validator checks the parent relations of a changed way (entitiesToValidate), so the way adds nothing
    expect(validateChanged(rule, graph, ['w-1'], schema)).toEqual([])
    const fromRelation = validateChanged(rule, graph, ['r-1'], schema)
    expect(fromRelation.map((issue) => issue.id)).toEqual([
      'relation_members:duplicate_member:w-1:r-1',
    ])
    // after the fix the duplicate is gone, and an issue with another member would have another id
    const issue = uniqueById(fromRelation)[0]
    const fixed = applyFix(graph, issue?.fixes[0])
    expect(validateChanged(rule, fixed, ['r-1'], schema)).toHaveLength(0)
  })
})

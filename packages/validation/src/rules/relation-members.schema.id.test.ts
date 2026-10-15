// Ported from Kyle's fork of iD (k-yle/iD a9b0a9ba6, test/spec/validations/relation.js, ISC, © iD contributors): the
// twelve test blocks of that spec, one test each, with the same data and the same expectations. Its message text is
// the messages of iD with the names of the features replaced by their kind and id; its fixes are the ones Maid has an
// action for (see the header of relation-members.ts). The tests that Kyle's spec has for a fix with no action are
// kept as far as the issue is found, and check that the fix is left out.
//
// Not ported: "follows relationCrossReference to find the schema". Maid's presets read `type` for the schema and have no
// relationCrossReference.
import { describe, expect, it } from 'bun:test'
import { Graph } from '@osm-editor-kit/maid-model'
import type { Action, OsmEntity } from '@osm-editor-kit/maid-model'
import {
  dataOf,
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

/** iD's Admin Boundary schema, as Kyle's spec gives it (the labels, the minimum and maximum, the tag patterns) */
const adminBoundary: RelationRoles = {
  inner: { label: 'Inner', member: { role: 'inner', geometry: ['line', 'area'] } },
  outer: { label: 'Outer', member: { role: 'outer', geometry: ['line', 'area'], min: 1 } },
  admin_center: {
    label: 'Admin Centre',
    member: {
      role: 'admin_center',
      geometry: ['point', 'vertex'],
      matchTags: [{ place: '*' }],
      max: 1,
    },
  },
  label: {
    label: 'Label',
    member: { role: 'label', geometry: ['point', 'vertex'], matchTags: [{ place: '*' }], max: 1 },
  },
}

/** Kyle's spec sets `allowDuplicateMembers: false` on the Admin Boundary, so the presets do not allow duplicates */
const presets = schemaPresets((tags) => (tags.type === 'boundary' ? adminBoundary : {}), false)

function typeOf(id: string): 'node' | 'way' | 'relation' {
  if (id.startsWith('n-')) return 'node'
  if (id.startsWith('w-')) return 'way'
  return 'relation'
}

/** A member of the relation r-1: the entity's id, its type from the id, and its role */
function at(id: string, role: string) {
  return { id, type: typeOf(id), role }
}

/**
 * The scene of iD's spec: the nodes n-1 to n-3 and the open way w-1 through them (a line, so n-1 is a vertex), the
 * extra entities, and the relation r-1 with these members. Everything is changed, as iD's spec's history is.
 */
function sceneWith(
  tags: Record<string, string>,
  members: ReturnType<typeof at>[],
  extra: OsmEntity[] = [],
) {
  const graph = graphOf(
    node('n-1', 4, 4),
    node('n-2', 4, 5),
    node('n-3', 5, 5),
    way('w-1', ['n-1', 'n-2', 'n-3']),
    ...extra,
    relation('r-1', members, tags),
  )
  const ids = [...extra.map((entity) => entity.id), 'n-1', 'n-2', 'n-3', 'w-1', 'r-1']
  return { graph, ids }
}

/** The issues of the scene, one per id as the validator keeps them */
function issuesOf(graph: Graph, ids: readonly string[]) {
  return uniqueById(validateChanged(rule, graph, ids, presets))
}

/** Applies the actions of a fix on a copy of the graph, as the editor does: one undo step */
function applyFix(graph: Graph, fix: Fix | undefined): Graph {
  if (!fix) throw new Error('the issue has no such fix')
  const actions: Action[] = fix.actions(new Graph(graph))
  return actions.reduce<Graph>((head, action) => action(head), new Graph(graph))
}

/** The members of the relation r-1 after a fix, as `id:role` */
function membersAfter(graph: Graph, fix: Fix | undefined) {
  const after = applyFix(graph, fix).hasEntity('r-1') as unknown as {
    members: { id: string; role: string }[]
  }
  return after.members.map((member) => `${member.id}:${member.role}`)
}

const labelsOf = (issue: Issue | undefined) => issue?.fixes.map((fix) => fix.label)
const subtypeOf = (issue: Issue | undefined) => dataOf(issue).subtype

describe("relation_members (schema subtypes, Kyle's spec)", () => {
  // Kyle's four "a role is missing" cases are missing_role's in Maid (one issue per missing role, not two); the
  // suggestions without the roles whose maximum is reached are tested in missing-role.id.test.ts
  it('leaves a member without a role to missing_role', () => {
    const { graph, ids } = sceneWith(
      { type: 'boundary' },
      [at('w-1', 'outer'), at('n-9', '')],
      [node('n-9', 6, 6, { place: 'suburb' })],
    )
    expect(issuesOf(graph, ids)).toHaveLength(0)
  })

  it('has no errors on init', () => {
    expect(validateChanged(rule, graphOf(), [], presets)).toHaveLength(0)
  })

  it('errors if there are min requirement is not satisfied', () => {
    const { graph, ids } = sceneWith({ type: 'boundary' }, [])
    const issues = issuesOf(graph, ids)
    expect(issues).toHaveLength(1)
    expect(subtypeOf(issues[0])).toBe('too_few')
    expect(issues[0]?.message).toBe(
      'The relation r-1 does not have enough members with the role “Outer”',
    )
    expect(issues[0]?.entityIds).toEqual(['r-1'])
    // Kyle's spec has a fix here, "Add 1 member/s", which only shows the count: Maid has no action to add a member
    expect(issues[0]?.fixes).toHaveLength(0)
  })

  it('errors if there are max requirement is not satisfied', () => {
    const { graph, ids } = sceneWith(
      { type: 'boundary', name: 'Exampletown' },
      [at('w-1', 'outer'), at('n-9', 'label'), at('n-10', 'label')],
      [node('n-9', 6, 6, { place: 'village' }), node('n-10', 7, 7, { place: 'town' })],
    )
    const issues = issuesOf(graph, ids)
    expect(issues).toHaveLength(1)
    expect(subtypeOf(issues[0])).toBe('too_many')
    expect(issues[0]?.message).toBe('The relation r-1 has too many members with the role “Label”')
    // Kyle's "Remove 1 member/s" has no action in his code either: the fix is left out
    expect(issues[0]?.fixes).toHaveLength(0)
  })

  it('errors if a member appears multiple times', () => {
    const { graph, ids } = sceneWith({ type: 'boundary', name: 'Exampletown CDP' }, [
      at('w-1', 'outer'),
      at('w-1', 'outer'),
    ])
    const issues = issuesOf(graph, ids)
    expect(issues).toHaveLength(1)
    expect(subtypeOf(issues[0])).toBe('duplicate_member')
    expect(issues[0]?.message).toBe('The way w-1 is included multiple times in the relation r-1')
    expect(labelsOf(issues[0])).toEqual(['Remove from relation'])
  })

  it('errors if a role is invalid, and only suggests appropriate roles', () => {
    const { graph, ids } = sceneWith(
      { type: 'boundary', building: 'house' },
      [at('w-2', 'potatoe'), at('w-1', 'outer')],
      [way('w-2', ['n-1', 'n-2', 'n-3'])],
    )
    const issues = issuesOf(graph, ids)
    expect(issues).toHaveLength(1)
    expect(subtypeOf(issues[0])).toBe('wrong_role')
    expect(issues[0]?.message).toBe('The way w-2 has the wrong role within the relation r-1')
    expect(labelsOf(issues[0])).toEqual([
      'Change role to “Inner”',
      'Change role to “Outer”',
      'Remove from relation',
    ])
  })

  it('errors if the required tags are missing for that role', () => {
    const { graph, ids } = sceneWith({ type: 'boundary' }, [
      at('n-1', 'admin_center'),
      at('w-1', 'outer'),
    ])
    const issues = issuesOf(graph, ids)
    expect(issues).toHaveLength(1)
    expect(subtypeOf(issues[0])).toBe('invalid_tags')
    expect(issues[0]?.message).toBe('The node n-1 needs different tags')
    // Kyle's "Change to a Suburb" changes the tags with the preset's tags: Maid has no preset names or unsetTags for it
    expect(labelsOf(issues[0])).toEqual(['Remove from relation'])
  })

  it('errors if the geometry of a member is invalid', () => {
    const { graph, ids } = sceneWith(
      { type: 'boundary' },
      [at('w-2', 'admin_center'), at('w-1', 'outer')],
      [way('w-2', ['n-1', 'n-2', 'n-3'], { place: 'suburb' })],
    )
    const issues = issuesOf(graph, ids)
    expect(issues).toHaveLength(1)
    expect(subtypeOf(issues[0])).toBe('invalid_geometry')
    expect(issues[0]?.message).toBe(
      'The way w-2 can’t have this geometry, since it belongs to the relation r-1',
    )
    expect(dataOf(issues[0]).expectedGeometry).toEqual(['point', 'vertex'])
    // Kyle's "Change the geometry" has no action in his code either: the removal is the only fix
    expect(labelsOf(issues[0])).toEqual(['Remove from relation'])
  })
})

describe("relation_members (schema subtypes, Maid's additions)", () => {
  it('has no issue without presets, which are not made yet', () => {
    const { graph, ids } = sceneWith(
      { type: 'boundary' },
      [at('n-9', 'potatoe'), at('w-1', 'outer')],
      [node('n-9', 6, 6)],
    )
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('has no issue for a relation without a schema, or whose schema has no members', () => {
    const { graph, ids } = sceneWith(
      { type: 'multipolygon' },
      [at('n-9', 'potatoe'), at('w-1', 'outer')],
      [node('n-9', 6, 6)],
    )
    expect(
      validateChanged(
        rule,
        graph,
        ids,
        schemaPresets(() => ({}), false),
      ),
    ).toHaveLength(0)
  })

  it('does not count or check the members of a relation that are not downloaded', () => {
    // w-9 is a member that the graph does not have: no minimum is reported, and the others are checked
    const { graph, ids } = sceneWith(
      { type: 'boundary' },
      [at('w-9', 'outer'), at('n-9', 'potatoe')],
      [node('n-9', 6, 6, { place: 'suburb' })],
    )
    const issues = issuesOf(graph, ids)
    expect(issues.map(subtypeOf)).toEqual(['wrong_role'])
  })

  it('checks a relation when one of its members changes, not only when the relation does', () => {
    const { graph } = sceneWith(
      { type: 'boundary' },
      [at('w-1', 'outer'), at('n-9', 'potatoe')],
      [node('n-9', 6, 6, { place: 'suburb' })],
    )
    const issues = uniqueById(validateChanged(rule, graph, ['n-9'], presets))
    expect(issues).toHaveLength(1)
    expect(subtypeOf(issues[0])).toBe('wrong_role')
  })

  it('the role fix changes the role of the member and keeps its id and place in the relation', () => {
    const { graph, ids } = sceneWith(
      { type: 'boundary' },
      [at('w-2', 'potatoe'), at('w-1', 'outer')],
      [way('w-2', ['n-1', 'n-2', 'n-3'])],
    )
    const issue = issuesOf(graph, ids)[0]
    expect(membersAfter(graph, issue?.fixes[1])).toEqual(['w-2:outer', 'w-1:outer'])
  })

  it('the removal fix removes the membership the issue is about', () => {
    const { graph, ids } = sceneWith(
      { type: 'boundary' },
      [at('n-9', 'potatoe'), at('w-1', 'outer')],
      [node('n-9', 6, 6)],
    )
    const issue = issuesOf(graph, ids)[0]
    expect(membersAfter(graph, issue?.fixes[0])).toEqual(['w-1:outer'])
  })

  it('the issues of a relation have the subtype and the rule in their data and id', () => {
    const { graph, ids } = sceneWith(
      { type: 'boundary' },
      [at('w-1', 'outer'), at('n-9', 'potatoe')],
      [node('n-9', 6, 6, { place: 'suburb' })],
    )
    const issue = issuesOf(graph, ids)[0]
    expect(issue?.rule).toBe('relation_members')
    expect(issue?.severity).toBe('warning')
    expect(issue?.id).toBe('relation_members:wrong_role:n-9:r-1:1')
    expect(dataOf(issue).expectedRoles).toEqual(['admin_center', 'label'])
  })
})

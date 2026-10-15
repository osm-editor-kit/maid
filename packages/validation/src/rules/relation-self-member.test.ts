import { describe, expect, it } from 'bun:test'
import { Graph } from '@osm-editor-kit/maid-model'
import type { Action } from '@osm-editor-kit/maid-model'
import { graphOf, node, relation, validateChanged, way } from '../id-test-helpers.ts'
import { createValidator, defaultRules } from '../index.ts'
import type { Fix, Issue } from '../types.ts'
import { relationSelfMember } from './relation-self-member.ts'

/** Applies the actions of a fix on a copy of the graph, as the editor does: one undo step */
function applyFix(graph: Graph, fix: Fix | undefined): Graph {
  if (!fix) throw new Error('the issue has no such fix')
  const actions: Action[] = fix.actions(new Graph(graph))
  return actions.reduce<Graph>((head, action) => action(head), new Graph(graph))
}

/** The members of a relation in a graph, as plain objects */
function membersOf(graph: Graph, id: string) {
  const entity = graph.hasEntity(id) as unknown as { members?: unknown[] } | undefined
  return entity?.members
}

const rule = relationSelfMember

describe('relation_self_member', () => {
  it('has no issues without relations as members', () => {
    const graph = graphOf(
      node('n-1', 4, 4),
      node('n-2', 4, 5),
      way('w-1', ['n-1', 'n-2'], { highway: 'residential' }),
      relation('r-1', [{ id: 'w-1', type: 'way', role: '' }], { type: 'route' }),
    )
    expect(validateChanged(rule, graph, ['r-1'])).toHaveLength(0)
  })

  it('warns about a relation that is its own member, with the fix that removes that membership', () => {
    const graph = graphOf(
      node('n-1', 4, 4),
      node('n-2', 4, 5),
      way('w-1', ['n-1', 'n-2'], { highway: 'residential' }),
      way('w-2', ['n-2', 'n-1'], { highway: 'residential' }),
      relation(
        'r-1',
        [
          { id: 'w-1', type: 'way', role: '' },
          { id: 'r-1', type: 'relation', role: 'child' },
          { id: 'w-2', type: 'way', role: '' },
        ],
        { type: 'route' },
      ),
    )
    const issues = validateChanged(rule, graph, ['r-1'])
    expect(issues).toHaveLength(1)
    const issue = issues[0] as Issue
    expect(issue.id).toBe('relation_self_member:r-1:1')
    expect(issue.rule).toBe('relation_self_member')
    expect(issue.severity).toBe('warning')
    expect(issue.entityIds).toEqual(['r-1'])
    expect(issue.message).toBe('The relation r-1 is a member of itself')
    expect(issue.fixes.map((fix) => fix.label)).toEqual(['Remove from relation'])

    // exactly that membership goes, the other two stay in their order
    const after = applyFix(graph, issue.fixes[0])
    expect(membersOf(after, 'r-1')).toEqual([
      { id: 'w-1', type: 'way', role: '' },
      { id: 'w-2', type: 'way', role: '' },
    ])
    expect(validateChanged(rule, after, ['r-1'])).toHaveLength(0)
  })

  it('makes the removal one undo step', () => {
    const graph = graphOf(
      node('n-1', 4, 4),
      relation('r-1', [{ id: 'r-1', type: 'relation', role: '' }], { type: 'route' }),
    )
    const issue = validateChanged(rule, graph, ['r-1'])[0]
    expect(issue?.fixes[0]?.actions(new Graph(graph))).toHaveLength(1)
  })

  it("deletes a relation whose only member was itself, as iD's remove_from_relation does", () => {
    const graph = graphOf(
      relation('r-1', [{ id: 'r-1', type: 'relation', role: '' }], {
        type: 'route',
        name: 'Bus 1',
      }),
    )
    const issue = validateChanged(rule, graph, ['r-1'])[0]
    const after = applyFix(graph, issue?.fixes[0])
    expect(after.hasEntity('r-1')).toBeUndefined()
  })

  it('does not take a member of another type for a self membership', () => {
    // a node with the id of the relation is not the relation (OSM ids are per type)
    const graph = graphOf(
      node('n-1', 4, 4),
      relation('r-1', [{ id: 'n-1', type: 'node', role: 'stop' }], { type: 'route' }),
    )
    expect(validateChanged(rule, graph, ['r-1'])).toHaveLength(0)
  })

  it('warns about two relations that contain each other, with no fix', () => {
    const graph = graphOf(
      relation('r-1', [{ id: 'r-2', type: 'relation', role: '' }], { type: 'route_master' }),
      relation('r-2', [{ id: 'r-1', type: 'relation', role: '' }], { type: 'route_master' }),
    )
    const first = validateChanged(rule, graph, ['r-1'])
    expect(first).toHaveLength(1)
    expect(first[0]?.message).toBe('The relation r-1 contains itself through r-2')
    expect(first[0]?.entityIds).toEqual(['r-1', 'r-2'])
    expect(first[0]?.fixes).toHaveLength(0)

    // the other relation of the cycle reports its own membership
    const second = validateChanged(rule, graph, ['r-2'])
    expect(second.map((issue) => issue.id)).toEqual(['relation_self_member:r-2:0'])
  })

  it('warns about a cycle through three relations, naming the chain', () => {
    const graph = graphOf(
      relation('r-1', [{ id: 'r-2', type: 'relation', role: '' }], { type: 'route_master' }),
      relation('r-2', [{ id: 'r-3', type: 'relation', role: '' }], { type: 'route_master' }),
      relation('r-3', [{ id: 'r-1', type: 'relation', role: '' }], { type: 'route_master' }),
    )
    const issues = validateChanged(rule, graph, ['r-1'])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toBe('The relation r-1 contains itself through r-2, r-3')
  })

  it('ends at a loop that does not lead back to the relation, without a crash or an issue', () => {
    const graph = graphOf(
      relation('r-1', [{ id: 'r-2', type: 'relation', role: '' }], { type: 'route_master' }),
      relation('r-2', [{ id: 'r-3', type: 'relation', role: '' }], { type: 'route_master' }),
      relation('r-3', [{ id: 'r-2', type: 'relation', role: '' }], { type: 'route_master' }),
    )
    expect(validateChanged(rule, graph, ['r-1'])).toHaveLength(0)
  })

  it('ignores sub relations that are not loaded (incomplete data)', () => {
    const graph = graphOf(
      relation(
        'r-1',
        [
          { id: 'r-9', type: 'relation', role: '' },
          { id: 'w-9', type: 'way', role: '' },
        ],
        { type: 'route' },
      ),
    )
    expect(validateChanged(rule, graph, ['r-1'])).toHaveLength(0)
  })

  it('is one of the default rules, so every app reports it', () => {
    const graph = graphOf(
      relation('r-1', [{ id: 'r-1', type: 'relation', role: '' }], { type: 'route' }),
    )
    const validator = createValidator(defaultRules)
    validator.validate(graph, ['r-1'], [])
    expect(validator.issuesFor('r-1').map((issue) => issue.rule)).toContain('relation_self_member')
  })
})

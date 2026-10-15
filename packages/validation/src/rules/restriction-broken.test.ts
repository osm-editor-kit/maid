import { describe, expect, it } from 'bun:test'
import { Graph } from '@osm-editor-kit/maid-model'
import type { Action, OsmEntity } from '@osm-editor-kit/maid-model'
import { graphOf, node, relation, validateChanged, way } from '../id-test-helpers.ts'
import { restrictionBroken } from './restriction-broken.ts'

// The via node v sits between the from way f (west of it) and the to way t (east of it).
function junction(...extra: OsmEntity[]) {
  return graphOf(
    node('fa', -0.001, 0),
    node('v', 0, 0),
    node('tb', 0.001, 0),
    way('f', ['fa', 'v']),
    way('t', ['v', 'tb']),
    ...extra,
  )
}

const restriction = (
  members: { id: string; type: 'node' | 'way' | 'relation'; role: string }[],
  tags: Record<string, string> = { type: 'restriction', restriction: 'no_left_turn' },
) => relation('r-1', members, tags)

const validMembers = [
  { id: 'f', type: 'way' as const, role: 'from' },
  { id: 'v', type: 'node' as const, role: 'via' },
  { id: 't', type: 'way' as const, role: 'to' },
]

/** Applies a fix's actions in order, as the editor does, and returns the head graph */
function applyFix(graph: Graph, actions: (g: Graph) => Action[]) {
  return actions(graph).reduce<Graph>((head, action) => action(head), new Graph(graph))
}

describe('restriction_broken', () => {
  it('has no issue for a restriction whose from and to ways touch the via node', () => {
    const graph = junction(restriction(validMembers))
    expect(validateChanged(restrictionBroken, graph, ['r-1'])).toEqual([])
  })

  it('reports a from way that does not touch the via, with no fix', () => {
    const graph = graphOf(
      node('fa', -0.001, 0),
      node('fb', -0.002, 0),
      node('v', 0, 0),
      node('tb', 0.001, 0),
      way('f', ['fa', 'fb']),
      way('t', ['v', 'tb']),
      restriction(validMembers),
    )
    const issues = validateChanged(restrictionBroken, graph, ['r-1'])
    expect(issues.map((issue) => issue.id)).toEqual(['restriction_broken:r-1'])
    expect(issues[0]?.message).toContain('the way f does not touch the via')
    expect(issues[0]?.entityIds).toEqual(['r-1', 'f', 'v', 't'])
    expect(issues[0]?.fixes).toEqual([])
  })

  it('offers to delete the restriction when its to way was deleted, as one undo step', () => {
    const base = junction(restriction(validMembers))
    const to = base.hasEntity('t')
    if (!to) throw new Error('the way t is missing')
    // the way is removed but the relation still lists it: the member is deleted, not merely not loaded
    const head = new Graph(base).remove(to)
    const issues = validateChanged(restrictionBroken, head, ['r-1'])
    expect(issues.map((issue) => issue.id)).toEqual(['restriction_broken:r-1'])
    expect(issues[0]?.message).toContain('the to way t was deleted')
    // the deleted way is not named: the validator would drop an issue that names an entity that left the graph
    expect(issues[0]?.entityIds).toEqual(['r-1', 'f', 'v'])
    const [fix] = issues[0]?.fixes ?? []
    expect(fix?.label).toBe('Delete the turn restriction')
    if (!fix) throw new Error('the issue has no fix')
    const after = applyFix(head, (graph) => fix.actions(graph))
    expect(after.hasEntity('r-1')).toBeUndefined()
    // the ways stay: they are the person's data
    expect(after.hasEntity('f')).toBeDefined()
    expect(after.hasEntity('v')).toBeDefined()
  })

  it('reports a restriction whose member is not loaded as not judged', () => {
    // the to way is in neither the graph nor the local deletions: it is simply not loaded
    const graph = graphOf(
      node('fa', -0.001, 0),
      node('v', 0, 0),
      way('f', ['fa', 'v']),
      restriction(validMembers),
    )
    expect(validateChanged(restrictionBroken, graph, ['r-1'])).toEqual([])
  })

  it('has no issue for a no_entry with two from ways that both touch the via', () => {
    const graph = junction(
      node('fc', 0, 0.001),
      way('f2', ['fc', 'v']),
      restriction(
        [
          { id: 'f', type: 'way', role: 'from' },
          { id: 'f2', type: 'way', role: 'from' },
          { id: 'v', type: 'node', role: 'via' },
          { id: 't', type: 'way', role: 'to' },
        ],
        { type: 'restriction', restriction: 'no_entry' },
      ),
    )
    expect(validateChanged(restrictionBroken, graph, ['r-1'])).toEqual([])
  })

  it('reports a no_entry without any from way, with no fix', () => {
    const graph = junction(
      restriction(
        [
          { id: 'v', type: 'node', role: 'via' },
          { id: 't', type: 'way', role: 'to' },
        ],
        { type: 'restriction', restriction: 'no_entry' },
      ),
    )
    const issues = validateChanged(restrictionBroken, graph, ['r-1'])
    expect(issues.map((issue) => issue.id)).toEqual(['restriction_broken:r-1'])
    expect(issues[0]?.message).toContain('it has no from way')
    expect(issues[0]?.fixes).toEqual([])
  })

  it('leaves a structurally broken restriction to turn_restriction_incomplete', () => {
    // two to ways on a restriction that is not no_exit: isValidRestriction fails, this rule reports nothing
    const graph = junction(
      node('tc', 0.002, 0),
      way('t2', ['v', 'tc']),
      restriction([...validMembers, { id: 't2', type: 'way', role: 'to' }]),
    )
    expect(validateChanged(restrictionBroken, graph, ['r-1'])).toEqual([])
  })
})

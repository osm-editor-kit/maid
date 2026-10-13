import { describe, expect, it } from 'bun:test'
import { Graph, OsmRelation } from '@osm-editor-kit/maid-model'
import type { RuleContext } from '@osm-editor-kit/maid-validation'
import { crossing } from './fixtures.ts'
import { turnRestrictionIncomplete, TURN_RESTRICTION_RULE_ID } from './restriction-rule.ts'

const { context, graph } = crossing()
const ctx: RuleContext = {
  graph,
  waysNear: () => [],
  validated: new Set<string>(),
  memo: new Map<string, unknown>(),
}

function relation(
  members: { id: string; type: 'way' | 'node'; role: string }[],
  restriction = 'no_straight_on',
) {
  const r = new OsmRelation(context, {
    id: 'r1',
    tags: { type: 'restriction', restriction },
    members,
  })
  return new Graph(graph).replace(r).entity('r1')
}

describe('turnRestrictionIncomplete', () => {
  it('reports a restriction without its to member', () => {
    const r = relation([
      { id: 'wn', type: 'way', role: 'from' },
      { id: 'c', type: 'node', role: 'via' },
    ])
    const issues = turnRestrictionIncomplete.validate(r, ctx)
    expect(issues.map((issue) => issue.rule)).toEqual([TURN_RESTRICTION_RULE_ID])
    expect(issues[0]!.entityIds).toEqual(['r1'])
  })

  it('accepts a complete restriction', () => {
    const r = relation([
      { id: 'wn', type: 'way', role: 'from' },
      { id: 'c', type: 'node', role: 'via' },
      { id: 'ws', type: 'way', role: 'to' },
    ])
    expect(turnRestrictionIncomplete.validate(r, ctx)).toEqual([])
  })

  it('ignores ways and other relations', () => {
    expect(turnRestrictionIncomplete.validate(graph.entity('wn'), ctx)).toEqual([])
  })
})

// Adopted from iD test/spec/validations/impossible_oneway.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { graphOf, node, validateChanged, way } from '../id-test-helpers.ts'
import type { Scene } from '../id-test-helpers.ts'
import { impossibleOneway } from './impossible-oneway.ts'

// Maid's Issue has no `type` or `subtype`: the rule is `issue.rule`, and iD's subtype is the
// issue's `data.type` ("highway" or "waterway"). iD's validate() runs on the changed entities in
// the order they were created, which is the order of the ids here.

/** iD's context.perform of the nodes and ways of a test, in that order */
function scene(...entities: ReturnType<typeof node | typeof way>[]): Scene {
  return {
    graph: graphOf(...entities),
    ids: entities.map((entity) => entity.id),
  }
}

describe('iD.validations.impossible_oneway', () => {
  const rule = impossibleOneway

  it('has no errors on init', () => {
    const issues = validateChanged(rule, graphOf(), [])
    expect(issues).toHaveLength(0)
  })

  describe('highways', () => {
    it('does not flag properly connecting oneway roads', () => {
      const { graph, ids } = scene(
        node('n-0', 2, 1),
        node('n-1', 1, 0),
        node('n-2', 2, 0),
        node('n-3', 3, 0),
        way('w-0', ['n-1', 'n-0', 'n-3'], { highway: 'unclassified' }),
        way('w-1', ['n-1', 'n-2'], { highway: 'unclassified', oneway: 'yes' }),
        way('w-2', ['n-2', 'n-3'], { highway: 'unclassified', oneway: 'yes' }),
      )
      const issues = validateChanged(rule, graph, ids)
      expect(issues).toHaveLength(0)
    })

    it('flags dangling oneway end', () => {
      const { graph, ids } = scene(
        node('n-0', 0, 0),
        node('n-1', 1, 0),
        node('n-2', 2, 0),
        way('w-0', ['n-0', 'n-1'], { highway: 'unclassified' }),
        way('w-1', ['n-1', 'n-2'], { highway: 'unclassified', oneway: 'yes' }),
      )
      const issues = validateChanged(rule, graph, ids)
      expect(issues).toHaveLength(1)
      const issue1 = issues[0]
      expect(issue1?.rule).toEqual('impossible_oneway')
      expect(issue1?.data?.type).toEqual('highway')
      expect(issue1?.severity).toEqual('warning')
      expect(issue1?.entityIds).toEqual(['w-1', 'n-2'])
    })

    it('flags unconnected oneway start', () => {
      const { graph, ids } = scene(
        node('n-0', 0, 0),
        node('n-1', 1, 0),
        node('n-2', 2, 0),
        way('w-0', ['n-0', 'n-1'], { highway: 'unclassified' }),
        way('w-1', ['n-2', 'n-1'], { highway: 'unclassified', oneway: 'yes' }),
      )
      const issues = validateChanged(rule, graph, ids)
      expect(issues).toHaveLength(1)
      const issue1 = issues[0]
      expect(issue1?.rule).toEqual('impossible_oneway')
      expect(issue1?.data?.type).toEqual('highway')
      expect(issue1?.severity).toEqual('warning')
      expect(issue1?.entityIds).toEqual(['w-1', 'n-2'])
    })

    it('flags oneway pointing to each other', () => {
      const { graph, ids } = scene(
        node('n-0', 2, 1),
        node('n-1', 1, 0),
        node('n-2', 2, 0),
        node('n-3', 3, 0),
        way('w-0', ['n-1', 'n-0', 'n-3'], { highway: 'unclassified' }),
        way('w-1', ['n-1', 'n-2'], { highway: 'unclassified', oneway: 'yes' }),
        way('w-2', ['n-3', 'n-2'], { highway: 'unclassified', oneway: 'yes' }),
      )
      const issues = validateChanged(rule, graph, ids)
      expect(issues).toHaveLength(2)
      const issue1 = issues[0]
      expect(issue1?.rule).toEqual('impossible_oneway')
      expect(issue1?.data?.type).toEqual('highway')
      expect(issue1?.severity).toEqual('warning')
      expect(issue1?.entityIds).toEqual(['w-1', 'n-2'])
      const issue2 = issues[1]
      expect(issue2?.rule).toEqual('impossible_oneway')
      expect(issue2?.entityIds).toEqual(['w-2', 'n-2'])
    })

    it('does not flags oneway with reverse "-1" oneway direction', () => {
      const { graph, ids } = scene(
        node('n-0', 2, 1),
        node('n-1', 1, 0),
        node('n-2', 2, 0),
        node('n-3', 3, 0),
        way('w-0', ['n-1', 'n-0', 'n-3'], { highway: 'unclassified' }),
        way('w-1', ['n-1', 'n-2'], { highway: 'unclassified', oneway: 'yes' }),
        way('w-2', ['n-3', 'n-2'], { highway: 'unclassified', oneway: '-1' }),
      )
      const issues = validateChanged(rule, graph, ids)
      expect(issues).toHaveLength(0)
    })

    it('does not flag non-oneway road with secondary tags implying oneway-ness', () => {
      const { graph, ids } = scene(
        node('n-0', 0, 0),
        node('n-1', 1, 0),
        node('n-2', 2, 0),
        way('w-0', ['n-0', 'n-1'], { highway: 'unclassified' }),
        way('w-1', ['n-1', 'n-2'], { highway: 'track', 'piste:type': 'downhill' }),
      )
      const issues = validateChanged(rule, graph, ids)
      expect(issues).toHaveLength(0)
    })
  })

  describe('waterways', () => {
    it('does not flag unconnected start or end points', () => {
      const { graph, ids } = scene(
        node('n-1', 1, 0),
        node('n-2', 2, 0),
        way('w-1', ['n-1', 'n-2'], { waterway: 'stream' }),
      )
      const issues = validateChanged(rule, graph, ids)
      expect(issues).toHaveLength(0)
    })

    it('flags waterways pointing to each other', () => {
      const { graph, ids } = scene(
        node('n-1', 1, 0),
        node('n-2', 2, 0),
        node('n-3', 3, 0),
        way('w-1', ['n-1', 'n-2'], { waterway: 'stream' }),
        way('w-2', ['n-3', 'n-2'], { waterway: 'stream' }),
      )
      const issues = validateChanged(rule, graph, ids)
      expect(issues).toHaveLength(2)
      const issue1 = issues[0]
      expect(issue1?.rule).toEqual('impossible_oneway')
      expect(issue1?.data?.type).toEqual('waterway')
      expect(issue1?.severity).toEqual('warning')
      expect(issue1?.entityIds).toEqual(['w-1', 'n-2'])
      const issue2 = issues[1]
      expect(issue2?.rule).toEqual('impossible_oneway')
      expect(issue2?.entityIds).toEqual(['w-2', 'n-2'])
    })
  })
})

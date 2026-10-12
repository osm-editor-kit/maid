// Maid's own test (not from Rapid): EditHistory works without a spatial index, so loading data does not compute geometry.
import { describe, expect, it } from 'bun:test'
import { Extent } from '@rapid-sdk/math'
import { EditHistory, ModelContext, OsmNode, OsmWay, actionMoveNode } from '../../src/index.ts'
import type { OsmEntity } from '../../src/index.ts'

// Private state under test. Only this file reads it.
interface PendingInternals {
  _pendingGeomGraph?: unknown
}
const internals = (entity: OsmEntity): PendingInternals => entity as unknown as PendingInternals

// Three nodes and one way over the first two.
function sampleEntities(context: ModelContext): OsmEntity[] {
  const n1 = new OsmNode(context, { id: 'n1', loc: [13.0, 52.0] })
  const n2 = new OsmNode(context, { id: 'n2', loc: [13.5, 52.25] })
  const n3 = new OsmNode(context, { id: 'n3', loc: [13.25, 52.1] })
  const way = new OsmWay(context, { id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'residential' } })
  return [n1, n2, n3, way]
}

describe('EditHistory without a spatial index', () => {
  it('merges, moves a node, commits, undoes and redoes', () => {
    const context = new ModelContext()
    const history = new EditHistory(context)
    expect(history.spatial).toBeUndefined()

    history.merge(sampleEntities(context))
    expect(history.hasWorkInProgress).toBe(false)

    const node = history.base.graph.entity('n1') as OsmNode
    const before = [...node.loc!] as [number, number]
    const after: [number, number] = [before[0] + 0.0001, before[1] + 0.0001]

    history.perform(actionMoveNode('n1', after))
    expect(history.hasWorkInProgress).toBe(true)
    history.commit({ annotation: 'moved a node', selectedIDs: ['n1'] })

    expect((history.stable.graph.entity('n1') as OsmNode).loc).toEqual(after)
    expect((history.base.graph.entity('n1') as OsmNode).loc).toEqual(before)
    expect(history.hasChanges()).toBe(true)
    expect(history.getUndoAnnotation()).toBe('moved a node')

    history.undo()
    expect((history.stable.graph.entity('n1') as OsmNode).loc).toEqual(before)
    expect(history.hasChanges()).toBe(false)

    history.redo()
    expect((history.stable.graph.entity('n1') as OsmNode).loc).toEqual(after)
  })

  it('throws from intersects() and waySegments()', () => {
    const context = new ModelContext()
    const history = new EditHistory(context)
    history.merge(sampleEntities(context))

    const message = 'EditHistory was created without a spatial index'
    expect(() => history.intersects()).toThrow(message)
    expect(() => history.waySegments(new Extent([13, 52], [14, 53]), history.base.graph)).toThrow(message)
  })

  it('leaves a way with pending geometry after merge', () => {
    const context = new ModelContext()
    const history = new EditHistory(context)
    history.merge(sampleEntities(context))

    const way = history.base.graph.entity('w1') as OsmWay
    expect(internals(way)._pendingGeomGraph).not.toBeUndefined()
  })
})

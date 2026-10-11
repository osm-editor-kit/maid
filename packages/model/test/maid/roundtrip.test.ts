// Maid's own test (not from Rapid): the whole chain a fixture takes through the model.
import { describe, expect, it } from 'bun:test'
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import {
  EditHistory,
  ModelContext,
  OsmJSONParser,
  SpatialIndex,
  actionMoveNode,
  cloneData,
  createOsmEntity,
} from '../../src/index.ts'
import type { OsmEntityProps, OsmNode } from '../../src/index.ts'

const fixture = JSON.parse(
  gunzipSync(readFileSync(`${import.meta.dir}/../../../../fixtures/small.json.gz`)).toString(),
) as { elements: { type: string; id: number }[] }

describe('fixture to history', () => {
  const context = new ModelContext()
  const editor = new EditHistory(context, new SpatialIndex())
  const parsed = new OsmJSONParser().parse(fixture)
  const entities = (parsed.data as OsmEntityProps[]).map((d) => createOsmEntity(context, d))
  editor.merge(entities)

  it('loads every element of the fixture into the base graph', () => {
    expect(entities.length).toBe(fixture.elements.length)
    const first = fixture.elements.find((e) => e.type === 'way')!
    expect(editor.base.graph.hasEntity(`w${first.id}`)).toBeDefined()
    expect(editor.hasChanges()).toBe(false)
  })

  it('moves a node, undoes and redoes it', () => {
    const node = entities.find((e) => e.type === 'node') as OsmNode
    const before = [...node.loc!] as [number, number]
    const after: [number, number] = [before[0] + 0.0001, before[1] + 0.0001]

    editor.perform(actionMoveNode(node.id, after))
    expect(editor.hasWorkInProgress).toBe(true)
    editor.commit({ annotation: 'moved a node', selectedIDs: [node.id] })

    expect((editor.stable.graph.entity(node.id) as OsmNode).loc).toEqual(after)
    expect((editor.base.graph.entity(node.id) as OsmNode).loc).toEqual(before)
    expect(editor.hasChanges()).toBe(true)
    expect(editor.getUndoAnnotation()).toBe('moved a node')

    editor.undo()
    expect((editor.stable.graph.entity(node.id) as OsmNode).loc).toEqual(before)
    expect(editor.hasChanges()).toBe(false)

    editor.redo()
    expect((editor.stable.graph.entity(node.id) as OsmNode).loc).toEqual(after)
  })
})

describe('cloneData', () => {
  it('copies plain data deeply and leaves the original alone', () => {
    const orig = { id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'path' }, members: [{ id: 'n1' }] }
    const copy = cloneData(orig)
    expect(copy).toEqual(orig)
    copy.nodes.push('n3')
    copy.tags.highway = 'track'
    copy.members[0]!.id = 'n9'
    expect(orig.nodes).toEqual(['n1', 'n2'])
    expect(orig.tags.highway).toBe('path')
    expect(orig.members[0]!.id).toBe('n1')
  })
})

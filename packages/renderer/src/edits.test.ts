import { describe, expect, it } from 'bun:test'
import {
  actionAddEntity,
  actionChangeTags,
  actionMoveNode,
  EditHistory,
  ModelContext,
  OsmNode,
} from '@osm-editor-kit/maid-model'
import { FeatureBuilder } from './build'
import { OsmData } from './data'
import { editKindOf } from './edits'

/** A way of two nodes, merged as the engine's data is; no map, no engine */
function loaded() {
  const context = new ModelContext()
  const history = new EditHistory(context)
  const data = new OsmData(context, history)
  data.merge([
    { type: 'node', id: 1, lat: 52, lon: 13, tags: {} },
    { type: 'node', id: 2, lat: 52.001, lon: 13.001, tags: {} },
    { type: 'way', id: 1, nodes: [1, 2], tags: { highway: 'residential' } },
  ])
  return { data, history }
}

describe('editKindOf (iD visual diff: added, moved, retagged)', () => {
  it('is undefined for what was not edited', () => {
    const { history } = loaded()
    const graph = history.staging.graph
    expect(editKindOf(graph, 'n1')).toBeUndefined()
    expect(editKindOf(graph, 'w1')).toBeUndefined()
  })

  it('is retagged for a change of tags only', () => {
    const { history } = loaded()
    history.perform(actionChangeTags('w1', { highway: 'service' }))
    const graph = history.staging.graph
    expect(editKindOf(graph, 'w1')).toBe('retagged')
    expect(editKindOf(graph, 'n1')).toBeUndefined()
  })

  it('is moved for a node that moved, and for the way that has it', () => {
    const { history } = loaded()
    history.perform(actionMoveNode('n1', [13.01, 52.01]))
    const graph = history.staging.graph
    expect(editKindOf(graph, 'n1')).toBe('moved')
    expect(editKindOf(graph, 'w1')).toBe('moved')
    expect(editKindOf(graph, 'n2')).toBeUndefined()
  })

  it('is added for an entity that was not loaded', () => {
    const { history } = loaded()
    history.perform(
      actionAddEntity(new OsmNode(history.context, { id: 'n-1', loc: [13.2, 52.2], tags: {} })),
    )
    expect(editKindOf(history.staging.graph, 'n-1')).toBe('added')
  })

  it('is undefined again when an edit is undone', () => {
    const { history } = loaded()
    history.perform(actionChangeTags('w1', { highway: 'service' }))
    history.commit({ annotation: 'Changed tags', selectedIDs: ['w1'] })
    history.undo()
    expect(editKindOf(history.staging.graph, 'w1')).toBeUndefined()
  })
})

describe('the builder sets the edit on the features it builds', () => {
  it('a way with a moved node has ed "moved"; an untouched way has none', () => {
    const { data, history } = loaded()
    const builder = new FeatureBuilder(data)
    const way = data.way('w1')!
    expect(builder.buildWay(way)?.feature.properties).not.toHaveProperty('ed')
    history.perform(actionMoveNode('n1', [13.01, 52.01]))
    const moved = builder.buildWay(data.way('w1')!)
    expect(moved?.feature.properties).toMatchObject({ ed: 'moved' })
  })
})

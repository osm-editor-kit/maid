import { describe, expect, it } from 'bun:test'
import { actionChangeTags, entitiesFromOsmJson } from '@osm-editor-kit/maid-model'
import { createEditor } from './index.ts'

describe('the data of an editor', () => {
  it('has a history that loads, edits and undoes', () => {
    const editor = createEditor()
    const entities = entitiesFromOsmJson(editor.context, [
      { type: 'node', id: 1, lon: 13.4, lat: 52.5, tags: { amenity: 'bench' } },
    ])
    editor.history.merge(entities)
    editor.history.perform(actionChangeTags('n1', { amenity: 'cafe' }))
    editor.history.commit({ annotation: 'Changed tags', selectedIDs: ['n1'] })
    expect(editor.history.stable.graph.entity('n1').tags).toEqual({ amenity: 'cafe' })
    editor.history.undo()
    expect(editor.history.stable.graph.entity('n1').tags).toEqual({ amenity: 'bench' })
  })

  it('is separate for every editor', () => {
    expect(createEditor().history).not.toBe(createEditor().history)
  })
})

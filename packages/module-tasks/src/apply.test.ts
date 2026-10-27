import { describe, expect, it } from 'bun:test'
import { EditHistory, ModelContext, OsmWay } from '@osm-editor-kit/maid-model'
import { applyTaskOption } from './apply.ts'

const option = { set: { surface: 'asphalt' }, remove: ['note'] }

function history() {
  const context = new ModelContext()
  const edits = new EditHistory(context)
  edits.merge([
    new OsmWay(context, {
      id: 'w1',
      nodes: [],
      tags: { highway: 'residential', note: 'check', surface: 'gravel' },
    }),
  ])
  return edits
}

const tagsOf = (edits: EditHistory, id: string) => edits.staging.graph.hasEntity(id)?.tags

describe('applyTaskOption', () => {
  it('sets and removes tags as one undo step with the annotation', () => {
    const edits = history()
    expect(applyTaskOption(edits, 'w1', option, 'Task: Fix it', false)).toEqual({ ok: true })
    expect(tagsOf(edits, 'w1')).toEqual({ highway: 'residential', surface: 'asphalt' })
    expect(edits.index).toBe(1)
    expect(edits.getUndoAnnotation()).toBe('Task: Fix it')
    edits.undo()
    expect(tagsOf(edits, 'w1')).toEqual({
      highway: 'residential',
      note: 'check',
      surface: 'gravel',
    })
  })

  it('refuses a read-only feature and changes nothing', () => {
    const edits = history()
    expect(applyTaskOption(edits, 'w1', option, 'x', true)).toEqual({
      ok: false,
      reason: 'read-only',
    })
    expect(edits.index).toBe(0)
  })

  it('refuses a feature that is not in the data', () => {
    expect(applyTaskOption(history(), 'w9', option, 'x', false)).toEqual({
      ok: false,
      reason: 'missing',
    })
  })

  it('does not commit an option that is applied already', () => {
    const edits = history()
    applyTaskOption(edits, 'w1', option, 'x', false)
    expect(applyTaskOption(edits, 'w1', option, 'x', false)).toEqual({
      ok: false,
      reason: 'applied',
    })
    expect(edits.index).toBe(1)
  })
})

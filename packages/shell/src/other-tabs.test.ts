import { describe, expect, it } from 'bun:test'
import {
  EditHistory,
  ModelContext,
  OsmNode,
  actionChangeTags,
  actionMoveNode,
} from '@osm-editor-kit/maid-model'
import { createOtherTabs, type TabChannel, type TabMessage } from './other-tabs'

/** Channels that deliver to each other at once, the way BroadcastChannel does between tabs */
function linkedChannels(count: number): TabChannel[] {
  const listeners: ((event: { data: TabMessage }) => void)[][] = []
  return Array.from({ length: count }, (_, i) => {
    listeners[i] = []
    return {
      postMessage(message) {
        listeners.forEach((list, j) => {
          if (j !== i) for (const listener of list) listener({ data: structuredClone(message) })
        })
      },
      addEventListener(_type, listener) {
        listeners[i]?.push(listener)
      },
      close() {
        if (listeners[i]) listeners[i].length = 0
      },
    }
  })
}

function tab() {
  const context = new ModelContext()
  const history = new EditHistory(context)
  history.merge([
    new OsmNode(context, { id: 'n1', loc: [13, 52] }),
    new OsmNode(context, { id: 'n2', loc: [13.1, 52.1] }),
  ])
  return history
}

describe('createOtherTabs', () => {
  it('counts the other tabs and its own changed features', () => {
    const [a, b] = linkedChannels(2)
    const first = tab()
    const one = createOtherTabs('t', first, a)
    const two = createOtherTabs('t', tab(), b)
    expect(one.getState()).toEqual({ mine: 0, others: 1, shared: [] })
    expect(two.getState()).toEqual({ mine: 0, others: 1, shared: [] })

    first.perform(actionMoveNode('n1', [13.01, 52.01]))
    first.commit({ annotation: 'moved', selectedIDs: ['n1'] })
    expect(one.getState()).toEqual({ mine: 1, others: 1, shared: [] })
  })

  it('names the features both tabs changed, and forgets them when one undoes', () => {
    const [a, b] = linkedChannels(2)
    const first = tab()
    const second = tab()
    const one = createOtherTabs('t', first, a)
    const two = createOtherTabs('t', second, b)
    first.perform(actionChangeTags('n1', { note: 'a' }))
    first.commit({ annotation: 'tag', selectedIDs: ['n1'] })
    second.perform(actionChangeTags('n2', { note: 'b' }))
    second.commit({ annotation: 'tag', selectedIDs: ['n2'] })
    expect(one.getState().shared).toEqual([])

    second.perform(actionChangeTags('n1', { note: 'b' }))
    second.commit({ annotation: 'tag', selectedIDs: ['n1'] })
    expect(one.getState().shared).toEqual(['n1'])
    expect(two.getState().shared).toEqual(['n1'])

    second.undo()
    expect(one.getState().shared).toEqual([])
    expect(two.getState().shared).toEqual([])
  })

  it('forgets a tab that closed', () => {
    const [a, b] = linkedChannels(2)
    const one = createOtherTabs('t', tab(), a)
    const two = createOtherTabs('t', tab(), b)
    two.stop()
    expect(one.getState().others).toBe(0)
  })

  it('works alone without a channel', () => {
    const one = createOtherTabs('t', tab(), undefined)
    expect(one.getState()).toEqual({ mine: 0, others: 0, shared: [] })
  })
})

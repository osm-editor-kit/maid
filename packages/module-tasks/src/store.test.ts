import { describe, expect, it } from 'bun:test'
import { nextOpenIndex, countStatuses, visibleIndexes } from './list.ts'
import {
  createTasksStore,
  withKeepLocal,
  withMarkedSaved,
  withRemote,
  withStatus,
  EMPTY_STATE,
} from './store.ts'
import { makeFile, openedStore } from './test-support.ts'

const file = makeFile([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }])

describe('open', () => {
  it('starts all open on the first task, with revisions at 0', () => {
    const state = openedStore(file).getState()
    expect(state.statuses).toEqual(['open', 'open', 'open', 'open'])
    expect(state.current).toBe(0)
    expect([state.localRevision, state.ackedRevision]).toEqual([0, 0])
    expect(state.list?.listKey).toHaveLength(8)
    expect(state.list?.geojson.features).toHaveLength(4)
  })

  it('takes saved progress of the same size and ignores one of another size', () => {
    const store = createTasksStore()
    store
      .getState()
      .actions.open(
        { file, fileName: 'x' },
        { statuses: ['done', 'open', 'open', 'skipped'], localRevision: 3, ackedRevision: 2 },
      )
    const state = store.getState()
    expect(state.statuses[0]).toBe('done')
    expect([state.localRevision, state.ackedRevision]).toEqual([3, 2])
    // the first open task is current
    expect(state.current).toBe(1)
    store
      .getState()
      .actions.open(
        { file, fileName: 'x' },
        { statuses: ['done'], localRevision: 1, ackedRevision: 0 },
      )
    expect(store.getState().statuses).toEqual(['open', 'open', 'open', 'open'])
  })

  it('clears an earlier error and the loading mark', () => {
    const store = createTasksStore()
    store.getState().actions.start('f')
    store.getState().actions.fail({ fileName: 'f', errors: [{ path: '$', message: 'x' }] })
    expect(store.getState().loading).toBeUndefined()
    store.getState().actions.open({ file, fileName: 'f' })
    expect(store.getState().error).toBeUndefined()
  })
})

describe('status changes', () => {
  it('copies the array and raises the local revision above the acked one', () => {
    const state = openedStore(file).getState()
    const change = withStatus(state, 1, 'done')
    expect(change?.statuses).not.toBe(state.statuses)
    expect(change?.statuses?.[1]).toBe('done')
    expect(state.statuses[1]).toBe('open')
    expect(change?.localRevision).toBe(1)
  })

  it('does nothing for the same status or an index outside the list', () => {
    const state = openedStore(file).getState()
    expect(withStatus(state, 1, 'open')).toBeUndefined()
    expect(withStatus(state, 9, 'done')).toBeUndefined()
    expect(withStatus(state, -1, 'done')).toBeUndefined()
  })

  it('counts every change, so a later one is always above the acked revision', () => {
    const store = openedStore(file)
    store.getState().actions.setStatus(0, 'done')
    store.getState().actions.setStatus(1, 'ignored')
    expect(store.getState().localRevision).toBe(2)
    store.getState().actions.setStatus(1, 'ignored')
    expect(store.getState().localRevision).toBe(2)
  })

  it('markSaved: the account is at the saved revision; a change during the save stays a local change', () => {
    const store = openedStore(file)
    store.getState().actions.setStatus(0, 'done')
    const atSave = store.getState().localRevision
    store.getState().actions.setStatus(1, 'done')
    expect(withMarkedSaved(store.getState(), 4, 'gen00001', atSave)).toEqual({
      ackedRevision: 4,
      ackedGeneration: 'gen00001',
      localRevision: 5,
    })
    expect(
      withMarkedSaved({ ...store.getState(), localRevision: atSave }, 4, 'gen00001', atSave),
    ).toEqual({
      ackedRevision: 4,
      ackedGeneration: 'gen00001',
      localRevision: 4,
    })
  })

  it('takeRemote and keepLocal settle the revisions and close the conflict', () => {
    expect(withRemote(['done'], 7, 'gen00001')).toMatchObject({
      ackedRevision: 7,
      localRevision: 7,
      conflict: undefined,
    })
    expect(withKeepLocal(7, 'gen00001')).toMatchObject({
      ackedRevision: 7,
      localRevision: 8,
      conflictOpen: false,
    })
  })
})

describe('counts, filter and next open task', () => {
  const statuses = ['done', 'open', 'ignored', 'open', 'skipped'] as const
  it('counts each status', () => {
    expect(countStatuses(statuses)).toEqual({ open: 2, done: 1, ignored: 1, skipped: 1, total: 5 })
  })
  it('filters in file order', () => {
    expect(visibleIndexes(statuses, 'all')).toEqual([0, 1, 2, 3, 4])
    expect(visibleIndexes(statuses, 'open')).toEqual([1, 3])
    expect(visibleIndexes(statuses, 'done')).toEqual([0])
    expect(visibleIndexes([], 'open')).toEqual([])
  })
  it('finds the next open task after the current one, wrapping round', () => {
    expect(nextOpenIndex(statuses, null)).toBe(1)
    expect(nextOpenIndex(statuses, 1)).toBe(3)
    expect(nextOpenIndex(statuses, 3)).toBe(1)
    expect(nextOpenIndex(['done', 'done'], 0)).toBeUndefined()
    expect(nextOpenIndex(['open'], 0)).toBe(0)
    expect(nextOpenIndex([], null)).toBeUndefined()
  })
})

describe('close', () => {
  it('goes back to the empty state', () => {
    const store = openedStore(file)
    store.getState().actions.setStatus(0, 'done')
    store.getState().actions.close()
    expect(store.getState()).toMatchObject({ ...EMPTY_STATE, actions: expect.anything() })
  })
})

describe('applied tasks follow undo and redo', () => {
  it('undo takes the status back, redo sets done again, a later change by hand stays', () => {
    const store = openedStore(file)
    const { actions } = store.getState()
    actions.addApplied({ index: 0, entityId: 'w1', option: { set: { a: 'b' } }, before: 'open' })
    actions.setStatus(0, 'done')
    actions.followApplied(() => false)
    expect(store.getState().statuses[0]).toBe('open')
    actions.followApplied(() => true)
    expect(store.getState().statuses[0]).toBe('done')
    actions.setStatus(0, 'ignored')
    actions.followApplied(() => false)
    expect(store.getState().statuses[0]).toBe('ignored')
  })
})

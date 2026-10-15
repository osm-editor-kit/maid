import { describe, expect, it } from 'bun:test'
import { createWayTableStore, DEFAULT_CARRY, MAX_PER_SIDE_LIMIT } from './way-table-store.ts'

describe('the way table store', () => {
  it('starts with the module default and nothing chosen', () => {
    const store = createWayTableStore(3)
    const state = store.getState()
    expect(state.defaultLimit).toBe(3)
    expect(state.limits).toEqual({})
    expect(state.choices).toEqual({})
    expect(state.onlyDiffering).toBe(false)
    expect(state.pending).toBeNull()
    expect(state.carry).toEqual(DEFAULT_CARRY)
  })

  it('shows three more per reference, up to the limit, and keeps the others apart', () => {
    const store = createWayTableStore(3)
    const { actions } = store.getState()
    actions.showMore('w1')
    expect(store.getState().limits).toEqual({ w1: 6 })
    actions.showMore('w1')
    actions.showMore('w1')
    expect(store.getState().limits.w1).toBe(MAX_PER_SIDE_LIMIT)
    expect(store.getState().limits.w2).toBeUndefined()
  })

  it('remembers a junction choice per reference and forgets it', () => {
    const store = createWayTableStore(3)
    const { actions } = store.getState()
    actions.choose('w1', 'n2', 'w4')
    actions.choose('w1', 'n5', 'w6')
    actions.choose('w9', 'n2', 'w8')
    expect(store.getState().choices.w1).toEqual({ n2: 'w4', n5: 'w6' })
    actions.forgetChoices('w1')
    expect(store.getState().choices.w1).toBeUndefined()
    expect(store.getState().choices.w9).toEqual({ n2: 'w8' })
  })

  it('toggles the differing rows and the folded groups', () => {
    const store = createWayTableStore(3)
    const { actions } = store.getState()
    actions.toggleOnlyDiffering()
    actions.toggleGroup('road')
    expect(store.getState().onlyDiffering).toBe(true)
    expect(store.getState().folded).toEqual({ road: true })
    actions.toggleGroup('road')
    expect(store.getState().folded.road).toBe(false)
  })

  it('holds one batch waiting for a confirmation until it ends', () => {
    const store = createWayTableStore(3)
    const { actions } = store.getState()
    actions.startPending({ kind: 'carry', referenceId: 'w2', key: 'surface' })
    expect(store.getState().pending).toEqual({ kind: 'carry', referenceId: 'w2', key: 'surface' })
    actions.endPending()
    expect(store.getState().pending).toBeNull()
  })

  it('merges carry settings', () => {
    const store = createWayTableStore(3)
    store.getState().actions.setCarry({ direction: 'both' })
    expect(store.getState().carry).toEqual({ direction: 'both', count: 1, mode: 'fill-empty' })
    store.getState().actions.setCarry({ count: 3, mode: 'overwrite' })
    expect(store.getState().carry).toEqual({ direction: 'both', count: 3, mode: 'overwrite' })
  })
})

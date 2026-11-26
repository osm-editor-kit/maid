import { describe, expect, it } from 'bun:test'
import type { Operation, OperationChanges } from '@osm-editor-kit/maid-operations'
import { askOnTouch, changesConfirm, changesDetails } from './operation-changes'

const one: OperationChanges = {
  title: 'Reverse changes these tags',
  features: [
    {
      id: 'w1',
      label: 'w1',
      before: { 'cycleway:left': 'lane', highway: 'x' },
      after: { 'cycleway:right': 'lane', highway: 'x' },
    },
  ],
  submit: 'Reverse',
}

describe('operation changes', () => {
  it('as the menu table: a row per changed key, before and after', () => {
    expect(changesDetails(one)).toEqual({
      title: 'Reverse changes these tags',
      columns: [
        { label: 'Before', id: 'w1' },
        { label: 'After', id: 'w1' },
      ],
      rows: [
        { label: 'cycleway:left', cells: ['lane', undefined] },
        { label: 'cycleway:right', cells: [undefined, 'lane'] },
      ],
    })
    expect(changesDetails({ ...one, features: [] })).toBeUndefined()
  })

  it('as the confirm dialog: the tag diff of the feature', () => {
    expect(changesConfirm(one)).toMatchObject({
      picks: [],
      before: one.features[0]!.before,
      submit: 'Reverse',
    })
  })

  it('asks first on a touch device only, and only when tags change', () => {
    const operation = {
      id: 'reverse',
      label: 'Reverse',
      applies: () => true,
      disabled: () => undefined,
      run: () => ({ actions: [], annotation: '' }),
      changes: () => one,
    } satisfies Operation
    const context = { graph: undefined as never, selected: ['w1'] }
    expect(askOnTouch(operation, false)).toBe(operation)
    expect(askOnTouch(operation, true).confirm?.(context)?.after).toEqual(one.features[0]!.after)
    const none = { ...operation, changes: () => ({ ...one, features: [] }) }
    expect(askOnTouch(none, true).confirm?.(context)).toBeUndefined()
  })
})

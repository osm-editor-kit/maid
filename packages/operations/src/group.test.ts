import { describe, expect, test } from 'bun:test'
import { Graph, ModelContext } from '@osm-editor-kit/maid-model'
import { operationGroup } from './group.ts'
import type { Operation, OperationContext } from './types.ts'

function member(id: string, applies: boolean, reason?: string): Operation {
  return {
    id,
    label: `label ${id}`,
    applies: () => applies,
    disabled: () => reason,
    preview: () => [
      [
        [0, 0],
        [1, 1],
      ],
    ],
    run: () => ({ actions: [], annotation: id }),
  }
}

const context: OperationContext = { graph: new Graph(new ModelContext()), selected: ['w1'] }

describe('a group of operations', () => {
  const group = operationGroup({
    id: 'extract-group',
    label: () => 'Extract',
    members: [member('a', false), member('b', true, 'no'), member('c', true)],
  })

  test('applies when a member does, and offers the members that apply as its choices', () => {
    expect(group.applies(context)).toBe(true)
    expect(group.choices?.(context)).toEqual([
      { id: 'b', label: 'label b' },
      { id: 'c', label: 'label c' },
    ])
    expect(
      operationGroup({ id: 'g', label: () => 'G', members: [member('a', false)] }).applies(context),
    ).toBe(false)
  })

  test('a choice refuses and runs as its member; without one, the first member that can run', () => {
    expect(group.disabled({ ...context, choice: 'b' })).toBe('no')
    expect(group.disabled({ ...context, choice: 'c' })).toBeUndefined()
    expect(group.run({ ...context, choice: 'c' }).annotation).toBe('c')
    expect(group.run(context).annotation).toBe('c')
    expect(group.disabled(context)).toBeUndefined()
  })

  test('previews as its members, and has no start when they run', () => {
    expect(group.preview?.({ ...context, choice: 'c' })).toHaveLength(1)
    expect('start' in group).toBe(false)
  })

  test('members that run and members that start do not mix', () => {
    const starts = { ...member('s', true), start: () => {} }
    expect(() =>
      operationGroup({ id: 'g', label: () => 'G', members: [member('a', true), starts] }),
    ).toThrow()
  })
})

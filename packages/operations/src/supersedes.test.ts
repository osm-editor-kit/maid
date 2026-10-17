// The menu and the keys share one rule: an operation that lists another in `supersedes` hides it while it applies,
// whether or not it is enabled. Plain operations here, so the rule is tested on its own.
import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext } from '@osm-editor-kit/maid-model'
import { supersededIDs, visibleOperations } from './supersedes.ts'
import type { Operation, OperationContext } from './types.ts'

const graph = new Graph(new ModelContext())

function fake(
  id: string,
  options: { applies?: boolean; reason?: string; supersedes?: string[] } = {},
): Operation {
  return {
    id,
    label: id,
    shortcut: 'c',
    supersedes: options.supersedes,
    applies: () => options.applies ?? true,
    disabled: () => options.reason,
    run: () => ({ actions: [], annotation: id }),
  }
}

const context: OperationContext = { graph, selected: [] }

describe('supersedes: the menu and the keys', () => {
  it('hides the superseded operation while the superseding one applies and is enabled', () => {
    const list = [fake('merge'), fake('merge-areas', { supersedes: ['merge'] })]
    expect(supersededIDs(list, context)).toEqual(new Set(['merge']))
    expect(visibleOperations(list, context).map((op) => op.id)).toEqual(['merge-areas'])
  })

  it('still hides it when the superseding one is disabled: the one shown carries the reason', () => {
    const list = [
      fake('merge'),
      fake('merge-areas', { supersedes: ['merge'], reason: 'These areas have different tags.' }),
    ]
    expect(visibleOperations(list, context).map((op) => op.id)).toEqual(['merge-areas'])
    expect(visibleOperations(list, context)[0]?.disabled(context)).toBe(
      'These areas have different tags.',
    )
  })

  it('does not hide the superseded operation when the superseding one does not apply', () => {
    const list = [fake('merge'), fake('merge-areas', { applies: false, supersedes: ['merge'] })]
    expect(supersededIDs(list, context).size).toBe(0)
    expect(visibleOperations(list, context).map((op) => op.id)).toEqual(['merge'])
  })

  it('keeps the list order and drops what does not apply', () => {
    const list = [fake('a'), fake('b', { applies: false }), fake('c')]
    expect(visibleOperations(list, context).map((op) => op.id)).toEqual(['a', 'c'])
  })

  it('an operation without supersedes hides nothing', () => {
    const list = [fake('merge'), fake('other')]
    expect(supersededIDs(list, context).size).toBe(0)
    expect(visibleOperations(list, context).map((op) => op.id)).toEqual(['merge', 'other'])
  })
})

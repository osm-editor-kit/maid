import { describe, expect, it } from 'bun:test'
import type { Editor } from '@osm-editor-kit/maid-core'
import { Graph, ModelContext, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { OperationContext } from '@osm-editor-kit/maid-operations'
import { relationOperations } from './relations-operations.ts'
import { relationSessionActions } from './relations-session-store.ts'

const context = new ModelContext()

function relation(id: string, tags: Record<string, string>, members: string[] = []) {
  return new OsmRelation(context, {
    id,
    tags,
    members: members.map((member) => ({ id: member, type: 'way' as const, role: '' })),
  })
}

function way(id: string) {
  return new OsmWay(context, { id, nodes: ['n1', 'n2'], tags: { highway: 'primary' } })
}

// Relations: r1 holds w1; r2 holds w1 and w2; r3 is empty. The presets are not loaded: no roles, every relation takes.
const graph = () =>
  new Graph(context, [
    way('w1'),
    way('w2'),
    relation('r1', { type: 'route' }, ['w1']),
    relation('r2', { type: 'route' }, ['w1', 'w2']),
    relation('r3', { type: 'route' }),
  ])

const editor = { presets: undefined } as unknown as Editor

function ctx(selected: string[]): OperationContext {
  return { graph: graph(), selected }
}

function operation(id: string) {
  const found = relationOperations(editor).find((item) => item.id === id)
  if (!found) throw new Error(`no operation ${id}`)
  return found
}

describe('Add to relation (edit menu)', () => {
  it('does not apply without a selection', () => {
    expect(operation('add-to-relation').applies(ctx([]))).toBe(false)
  })

  it('is disabled with the reason when no relation of the session can take the selection', () => {
    const add = operation('add-to-relation')
    expect(add.applies(ctx(['w2']))).toBe(true)
    expect(add.disabled(ctx(['w2']))).toBeDefined()
  })

  it('adds the selection to the last session relation that can take it, in one step', () => {
    relationSessionActions.touch(['r1', 'r3'])
    const add = operation('add-to-relation')
    expect(add.disabled(ctx(['w2']))).toBeUndefined()
    const result = add.run(ctx(['w2']))
    expect(result.actions).toHaveLength(1)
    expect(result.annotation).not.toBe('')
  })
})

describe('Remove from relation (edit menu)', () => {
  it('applies when every selected feature is in one relation at least', () => {
    const remove = operation('remove-from-relation')
    expect(remove.applies(ctx(['w2']))).toBe(true)
    expect(remove.applies(ctx(['w2', 'r3']))).toBe(false)
  })

  it('removes the features from the one relation they share, in one step', () => {
    const remove = operation('remove-from-relation')
    // w1 is in r1 and r2: two relations, so the operation is disabled and the section does it
    expect(remove.disabled(ctx(['w1']))).toBeDefined()
    // w2 is in r2 only
    expect(remove.disabled(ctx(['w2']))).toBeUndefined()
    const result = remove.run(ctx(['w2']))
    expect(result.actions).toHaveLength(1)
  })
})

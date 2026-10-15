import { describe, expect, it } from 'bun:test'
import { buildTable, labelOf, type TableView } from './table.ts'
import { sceneOf } from './test-graph.ts'

const opts = { maxPerSide: 3 }

/** A chain: w1 (n1-n2) - w2 (n2-n3) - w3 (n3-n4), residential roads with names */
const road = [
  { id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'residential', name: 'Ost' } },
  { id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'residential', name: 'Mitte' } },
  { id: 'w3', nodes: ['n3', 'n4'], tags: { highway: 'residential', name: 'West' } },
]

function table(model: ReturnType<typeof buildTable>): TableView {
  if (model.kind !== 'table') throw new Error(`expected a table, got ${model.kind}`)
  return model
}

describe('buildTable: hints', () => {
  it('asks for a selection when nothing is selected', () => {
    expect(buildTable(sceneOf(road), [], opts)).toEqual({ kind: 'hint', reason: 'none' })
  })

  it('says a node is selected, not a way', () => {
    expect(buildTable(sceneOf(road), ['n2'], opts)).toEqual({ kind: 'hint', reason: 'node' })
  })

  it('says a relation is selected', () => {
    expect(buildTable(sceneOf(road), ['r9'], opts)).toEqual({ kind: 'hint', reason: 'relation' })
  })

  it('says a way is not loaded when the graph lacks it', () => {
    expect(buildTable(sceneOf(road), ['w99'], opts)).toEqual({ kind: 'hint', reason: 'missing' })
  })
})

describe('buildTable: one way', () => {
  it('shows the chain in order with the selected way in the middle', () => {
    const model = table(buildTable(sceneOf(road), ['w2'], opts))
    expect(model.mode).toBe('way')
    expect(model.referenceId).toBe('w2')
    expect(model.columns.map((column) => column.id)).toEqual(['w1', 'w2', 'w3'])
    expect(model.chain?.centerIndex).toBe(1)
    expect(model.hidden).toBe(0)
    expect(model.notWays).toBe(0)
  })

  it('marks a way that points against the reference as reversed', () => {
    const scene = sceneOf([
      { id: 'w1', nodes: ['n2', 'n1'], tags: { highway: 'residential' } },
      { id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'residential' } },
    ])
    const model = table(buildTable(scene, ['w2'], opts))
    expect(model.columns.find((column) => column.id === 'w1')?.reversed).toBe(true)
    expect(model.columns.find((column) => column.id === 'w2')?.reversed).toBe(false)
  })

  it('limits each side and stops with the limit', () => {
    const model = table(buildTable(sceneOf(road), ['w2'], { maxPerSide: 1 }))
    expect(model.columns.map((column) => column.id)).toEqual(['w1', 'w2', 'w3'])
    expect(model.chain?.stops).toEqual({ backward: 'limit', forward: 'limit' })
  })

  it('lists a junction and continues through the chosen way', () => {
    const scene = sceneOf([
      { id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'residential' } },
      { id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'residential' } },
      { id: 'w4', nodes: ['n2', 'n5'], tags: { highway: 'residential' } },
    ])
    const stopped = table(buildTable(scene, ['w2'], opts))
    expect(stopped.chain?.stops.backward).toBe('junction')
    expect(stopped.chain?.junctions.map((item) => item.nodeId)).toEqual(['n2'])
    expect([...(stopped.chain?.junctions[0]?.candidates ?? [])].sort()).toEqual(['w1', 'w4'])

    const chosen = table(
      buildTable(scene, ['w2'], { maxPerSide: 3, choose: new Map([['n2', 'w4']]) }),
    )
    expect(chosen.columns.map((column) => column.id)).toContain('w4')
    expect(chosen.columns.map((column) => column.id)).not.toContain('w1')
  })

  it('shows a lone way as the reference column alone', () => {
    const model = table(
      buildTable(
        sceneOf([{ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'path' } }]),
        ['w1'],
        opts,
      ),
    )
    expect(model.columns.map((column) => column.id)).toEqual(['w1'])
  })

  it('counts a selected node next to the way and does not show it', () => {
    const model = table(buildTable(sceneOf(road), ['w2', 'n2'], opts))
    expect(model.referenceId).toBe('w2')
    expect(model.notWays).toBe(1)
  })

  it('treats every column as read-only unless the editor says otherwise', () => {
    const all = table(buildTable(sceneOf(road), ['w2'], opts))
    expect(all.columns.every((column) => column.readOnly === true)).toBe(true)
    const some = table(
      buildTable(sceneOf(road), ['w2'], { ...opts, isReadOnly: (id) => id === 'w3' }),
    )
    expect(some.columns.map((column) => column.readOnly)).toEqual([false, false, true])
  })
})

describe('buildTable: a building', () => {
  it('uses the neighbours across a shared edge', () => {
    const scene = sceneOf([
      { id: 'a', nodes: ['a1', 'a2', 'a3', 'a4', 'a1'], tags: { building: 'yes' } },
      { id: 'b', nodes: ['a2', 'b2', 'b3', 'a3', 'a2'], tags: { building: 'house' } },
    ])
    const model = table(buildTable(scene, ['a'], opts))
    expect(model.mode).toBe('area')
    expect(model.columns.map((column) => column.id)).toContain('b')
    expect(model.columns.every((column) => column.reversed === false)).toBe(true)
  })
})

describe('buildTable: several features', () => {
  it('shows each selected way as a column, in chain order, with the first selected as reference', () => {
    const model = table(buildTable(sceneOf(road), ['w2', 'w1'], opts))
    expect(model.mode).toBe('several')
    expect(model.referenceId).toBe('w2')
    expect(model.order).toBe('chain')
    expect(model.columns.map((column) => column.id)).toEqual(['w1', 'w2'])
  })

  it('orders ways that do not form a chain by the line they lie on', () => {
    const model = table(buildTable(sceneOf(road), ['w3', 'w1'], opts))
    expect(model.order).toBe('axis')
    expect(model.columns.map((column) => column.id).sort()).toEqual(['w1', 'w3'])
  })

  it('counts the selected features that are not ways', () => {
    const model = table(buildTable(sceneOf(road), ['w1', 'w2', 'n3'], opts))
    expect(model.notWays).toBe(1)
    expect(model.columns).toHaveLength(2)
  })
})

describe('labelOf', () => {
  it('takes the name, then the ref, then the highway value, then the id', () => {
    expect(labelOf({ name: 'Ost', ref: 'B 1', highway: 'primary' }, 'w1')).toBe('Ost')
    expect(labelOf({ ref: 'B 1', highway: 'primary' }, 'w1')).toBe('B 1')
    expect(labelOf({ highway: 'primary' }, 'w1')).toBe('primary')
    expect(labelOf({}, 'w1')).toBe('w1')
  })
})

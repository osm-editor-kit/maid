import { describe, expect, it } from 'bun:test'
import type { Editor } from '@osm-editor-kit/maid-core'
import { type Action, Graph } from '@osm-editor-kit/maid-model'
import { buildWayChain } from './chain.ts'
import { buildTable, type TableView } from './table.ts'
import { sceneOf, type TestWay } from './test-graph.ts'
import {
  applyPlan,
  changedIds,
  changedKeysOf,
  carryPlan,
  setAllPlan,
  actionsOf,
  cellPlan,
} from './write.ts'

type History = Editor['history']

function view(graph: Graph, selected: string[]): TableView {
  const model = buildTable(graph, selected, { maxPerSide: 3, isReadOnly: () => false })
  if (model.kind !== 'table') throw new Error('expected a table')
  return model
}

const road: TestWay[] = [
  { id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'residential', surface: 'asphalt' } },
  { id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'residential', name: 'Mitte' } },
  { id: 'w3', nodes: ['n3', 'n4'], tags: { highway: 'residential' } },
]

/** A history stand-in that records what was performed and committed */
function recorder() {
  const performed: Action[][] = []
  const commits: { annotation?: unknown; selectedIDs?: unknown }[] = []
  const history = {
    perform: (...actions: Action[]) => performed.push(actions),
    commit: (options: { annotation?: unknown; selectedIDs?: unknown }) => commits.push(options),
  }
  return { history: history as unknown as History, performed, commits }
}

describe('setAllPlan', () => {
  it('writes the reference value where the other ways lack it', () => {
    const graph = sceneOf(road)
    const model = view(graph, ['w2'])
    const plan = setAllPlan(model.columns, 'w2', 'highway')
    expect(plan?.ok).toBe(true)
    if (!plan?.ok) return
    expect(plan.changes).toEqual([])
    const surface = setAllPlan(model.columns, 'w2', 'surface')
    expect(surface).toBeUndefined()
  })

  it('fills the other ways where the reference has a value', () => {
    const graph = sceneOf([
      { id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'residential' } },
      { id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'residential', surface: 'paving_stones' } },
      { id: 'w3', nodes: ['n3', 'n4'], tags: { highway: 'residential', surface: 'asphalt' } },
    ])
    const model = view(graph, ['w2'])
    const plan = setAllPlan(model.columns, 'w2', 'surface')
    expect(plan?.ok).toBe(true)
    if (!plan?.ok) return
    expect(plan.changes.map((change) => [change.id, change.set])).toEqual([
      ['w1', { surface: 'paving_stones' }],
      ['w3', { surface: 'paving_stones' }],
    ])
  })
})

describe('carryPlan', () => {
  it('carries forward to the next way of the chain, fill-empty by default', () => {
    const graph = sceneOf(road)
    const model = view(graph, ['w2'])
    expect(model.chain).toBeDefined()
    if (!model.chain) return
    const plan = carryPlan(model.chain, model.columns, 'w2', 'name', {
      direction: 'forward',
      count: 1,
      mode: 'fill-empty',
    })
    // w2 has the name; w3 has none, so it gets it
    expect(plan?.ok).toBe(true)
    if (!plan?.ok) return
    expect(plan.changes.map((change) => change.id)).toEqual(['w3'])
  })

  it('refuses the whole batch when a target is read-only', () => {
    const graph = sceneOf(road)
    const model = buildTable(graph, ['w2'], { maxPerSide: 3, isReadOnly: (id) => id === 'w3' })
    if (model.kind !== 'table' || !model.chain) throw new Error('expected a chain')
    const plan = carryPlan(model.chain, model.columns, 'w2', 'name', {
      direction: 'forward',
      count: 1,
      mode: 'overwrite',
    })
    expect(plan).toEqual({ ok: false, reason: 'read-only', ids: ['w3'] })
  })
})

describe('actionsOf and applyPlan', () => {
  it('turns a cell write into one action that changes only that key', () => {
    const graph = sceneOf(road)
    const model = view(graph, ['w2'])
    const column = model.columns.find((item) => item.id === 'w1')
    if (!column) throw new Error('no column')
    const plan = cellPlan(column, 'surface', 'paving_stones')
    const actions = actionsOf(graph, plan.ok ? plan.changes : [])
    expect(actions).toHaveLength(1)
    const next = actions.reduce<Graph>((state, action) => action(state), new Graph(graph))
    expect(next.entity('w1').tags).toEqual({ highway: 'residential', surface: 'paving_stones' })
  })

  it('removes a key when the value is cleared', () => {
    const graph = sceneOf(road)
    const model = view(graph, ['w2'])
    const column = model.columns.find((item) => item.id === 'w1')
    if (!column) throw new Error('no column')
    const plan = cellPlan(column, 'surface', undefined)
    const actions = actionsOf(graph, plan.ok ? plan.changes : [])
    const next = actions.reduce<Graph>((state, action) => action(state), new Graph(graph))
    expect(next.entity('w1').tags).toEqual({ highway: 'residential' })
  })

  it('performs the actions and commits once, with the annotation', () => {
    const graph = sceneOf(road)
    const model = view(graph, ['w2'])
    const column = model.columns.find((item) => item.id === 'w1')
    if (!column) throw new Error('no column')
    const { history, performed, commits } = recorder()
    const result = applyPlan(
      history,
      graph,
      cellPlan(column, 'surface', 'gravel'),
      'Changed surface on w1',
      ['w2'],
    )
    expect(result).toEqual({ ok: true, changed: 1 })
    expect(performed).toHaveLength(1)
    expect(commits).toEqual([{ annotation: 'Changed surface on w1', selectedIDs: ['w2'] }])
  })

  it('performs nothing for a refused plan', () => {
    const graph = sceneOf(road)
    const model = buildTable(graph, ['w2'], { maxPerSide: 3, isReadOnly: (id) => id === 'w1' })
    if (model.kind !== 'table') throw new Error('expected a table')
    const column = model.columns.find((item) => item.id === 'w1')
    if (!column) throw new Error('no column')
    const { history, performed, commits } = recorder()
    const result = applyPlan(history, graph, cellPlan(column, 'surface', 'gravel'), 'x', ['w2'])
    expect(result).toEqual({ ok: false, ids: ['w1'] })
    expect(performed).toHaveLength(0)
    expect(commits).toHaveLength(0)
  })

  it('commits nothing when the plan changes nothing', () => {
    const graph = sceneOf(road)
    const model = view(graph, ['w2'])
    const column = model.columns.find((item) => item.id === 'w2')
    if (!column) throw new Error('no column')
    const { history, commits } = recorder()
    const result = applyPlan(history, graph, cellPlan(column, 'name', 'Mitte'), 'x', ['w2'])
    expect(result).toEqual({ ok: true, changed: 0 })
    expect(commits).toHaveLength(0)
  })
})

describe('changedIds and changedKeysOf', () => {
  it('lists the ids a plan would change, and none when refused', () => {
    expect([
      ...changedIds({ ok: true, changes: [{ id: 'w1', set: {}, remove: [] }], skipped: [] }),
    ]).toEqual(['w1'])
    expect(changedIds({ ok: false, reason: 'read-only', ids: ['w1'] }).size).toBe(0)
    expect(changedIds(undefined).size).toBe(0)
  })

  it('finds the keys that differ from the base data, removed keys included', () => {
    const base = sceneOf(road)
    const edited = sceneOf([
      { id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'residential', surface: 'gravel' } },
      { id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'residential' } },
    ])
    const column = view(edited, ['w2']).columns.find((item) => item.id === 'w1')
    if (!column) throw new Error('no column')
    expect([...changedKeysOf(base, column)].sort()).toEqual(['surface'])
    const w2 = view(edited, ['w2']).columns.find((item) => item.id === 'w2')
    if (!w2) throw new Error('no column')
    expect([...changedKeysOf(base, w2)].sort()).toEqual(['name'])
  })
})

describe('the chain used by the plans', () => {
  it('is the same chain as the table shows', () => {
    const chain = buildWayChain(sceneOf(road), 'w2', { maxPerSide: 3 })
    expect(chain?.ways.map((item) => item.id)).toEqual(['w1', 'w2', 'w3'])
  })
})

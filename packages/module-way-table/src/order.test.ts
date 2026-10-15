import { describe, expect, test } from 'bun:test'
import { COLUMN_CAP, orderColumns } from './order.ts'
import { sceneOf, type TestWay } from './test-graph.ts'

const road = { highway: 'residential' }

describe('orderColumns', () => {
  test('ways that form one chain are in chain order, whatever the selection order', () => {
    const scene = sceneOf([
      { id: 'A', nodes: ['n0', 'n1'], tags: road },
      { id: 'B', nodes: ['n1', 'n2'], tags: road },
      { id: 'C', nodes: ['n2', 'n3'], tags: road },
    ])
    const order = orderColumns(scene, ['B', 'C', 'A'])
    expect(order.by).toBe('chain')
    expect(order.ids).toEqual(['A', 'B', 'C'])
    expect(order.shown).toEqual(['A', 'B', 'C'])
    expect(order.hidden).toBe(0)
    expect(order.notWays).toBe(0)
  })

  test('ways that do not form a chain are ordered along their main axis, west to east', () => {
    const scene = sceneOf(
      [
        { id: 'w1', nodes: ['a1', 'b1'], tags: road },
        { id: 'w2', nodes: ['a2', 'b2'], tags: road },
        { id: 'w3', nodes: ['a3', 'b3'], tags: road },
      ],
      {
        loc: {
          a1: [13.0, 52],
          b1: [13.0005, 52],
          a2: [13.2, 52.01],
          b2: [13.2005, 52.01],
          a3: [12.9, 51.99],
          b3: [12.9005, 51.99],
        },
      },
    )
    const order = orderColumns(scene, ['w2', 'w1', 'w3'])
    expect(order.by).toBe('axis')
    expect(order.ids).toEqual(['w3', 'w1', 'w2'])
  })

  test('a vertical arrangement is ordered south to north', () => {
    const scene = sceneOf(
      [
        { id: 's', nodes: ['sa', 'sb'], tags: road },
        { id: 'n', nodes: ['na', 'nb'], tags: road },
      ],
      { loc: { sa: [13, 52.5], sb: [13, 52.5005], na: [13.0001, 52.1], nb: [13.0001, 52.1005] } },
    )
    // n is at latitude 52.1, s at 52.5: south to north puts n first, whatever the selection order
    expect(orderColumns(scene, ['s', 'n']).ids).toEqual(['n', 's'])
    expect(orderColumns(scene, ['n', 's']).ids).toEqual(['n', 's'])
  })

  test('equal centres keep the selection order', () => {
    const scene = sceneOf(
      [
        { id: 'p', nodes: ['pa', 'pb'], tags: road },
        { id: 'q', nodes: ['qa', 'qb'], tags: road },
      ],
      { loc: { pa: [13, 52], pb: [13, 52], qa: [13, 52], qb: [13, 52] } },
    )
    const order = orderColumns(scene, ['q', 'p'])
    expect(order.by).toBe('axis')
    expect(order.ids).toEqual(['q', 'p'])
  })

  test('a way with a missing node has no axis, so the selection order is used', () => {
    const scene = sceneOf(
      [
        { id: 'w1', nodes: ['a1', 'b1'], tags: road },
        { id: 'w2', nodes: ['a2', 'b2'], tags: road },
      ],
      { omit: ['a2'] },
    )
    const order = orderColumns(scene, ['w2', 'w1'])
    expect(order.by).toBe('selection')
    expect(order.ids).toEqual(['w2', 'w1'])
  })

  test('one way, and nodes in the selection, are not columns', () => {
    const scene = sceneOf([{ id: 'only', nodes: ['p', 'q'], tags: road }])
    const order = orderColumns(scene, ['p', 'only'])
    expect(order.ids).toEqual(['only'])
    expect(order.by).toBe('selection')
    expect(order.notWays).toBe(1)
  })

  test('at most 24 columns are shown; the rest are counted', () => {
    expect(COLUMN_CAP).toBe(24)
    const ways: TestWay[] = []
    const loc: Record<string, [number, number]> = {}
    const selected: string[] = []
    for (let i = 0; i < 30; i++) {
      ways.push({ id: `w${i}`, nodes: [`a${i}`, `b${i}`], tags: road })
      loc[`a${i}`] = [13 + i * 0.01, 52]
      loc[`b${i}`] = [13 + i * 0.01 + 0.0001, 52]
      selected.push(`w${i}`)
    }
    const order = orderColumns(sceneOf(ways, { loc }), selected.reverse())
    expect(order.ids.length).toBe(30)
    expect(order.shown.length).toBe(24)
    expect(order.hidden).toBe(6)
    expect(order.shown[0]).toBe('w0')
  })
})

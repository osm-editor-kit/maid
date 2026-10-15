import { describe, expect, test } from 'bun:test'
import { type CellState, cellState, viewOf } from './cell-state.ts'
import type { Column } from './types.ts'

const ref: Column = {
  id: 'R',
  reversed: false,
  tags: {
    highway: 'residential',
    surface: 'asphalt',
    lit: 'yes',
    'cycleway:left': 'lane',
    oneway: 'yes',
  },
}

/** The state of `key` in `column`, against the reference column */
function stateOf(column: Column, key: string) {
  return cellState(viewOf(ref), viewOf(column), key, column.id === ref.id)
}

describe('cellState: every state', () => {
  const neighbour: Column = {
    id: 'N',
    reversed: false,
    tags: { highway: 'residential', surface: 'paving_stones', 'cycleway:right': 'track' },
  }

  const cases: [string, string, CellState, string | undefined][] = [
    ['highway', 'residential', 'same', 'residential'],
    ['surface', 'paving_stones', 'different', 'paving_stones'],
    ['cycleway:right', '', 'added', 'track'],
    ['lit', '', 'missing', undefined],
    ['maxspeed', '', 'empty', undefined],
  ]
  for (const [key, , state, value] of cases) {
    test(`${key} in a neighbour is ${state}`, () => {
      const cell = stateOf(neighbour, key)
      expect(cell.state).toBe(state)
      expect(cell.value).toBe(value)
      expect(cell.dependent).toBe(false)
    })
  }

  test('the reference column shows reference where the key is, and empty where it is not', () => {
    expect(stateOf(ref, 'surface')).toEqual({
      state: 'reference',
      dependent: false,
      value: 'asphalt',
    })
    expect(stateOf(ref, 'maxspeed')).toEqual({ state: 'empty', dependent: false, value: undefined })
  })

  test('a key set to an empty value is not a key', () => {
    const blank: Column = { id: 'B', reversed: false, tags: { surface: '' } }
    expect(stateOf(blank, 'surface').state).toBe('missing')
  })
})

describe('cellState: reversed columns compare in chain direction', () => {
  test('a reversed cycleway:right shows as cycleway:left, same as the reference', () => {
    const reversed: Column = { id: 'N', reversed: true, tags: { 'cycleway:right': 'lane' } }
    const cell = stateOf(reversed, 'cycleway:left')
    expect(cell).toEqual({ state: 'same', dependent: true, value: 'lane' })
    expect(viewOf(reversed).get('cycleway:left')?.storedKey).toBe('cycleway:right')
  })

  test('a reversed oneway=yes is the same as the reference oneway=-1', () => {
    const forward: Column = { id: 'R', reversed: false, tags: { oneway: '-1' } }
    const reversed: Column = { id: 'N', reversed: true, tags: { oneway: 'yes' } }
    const cell = cellState(viewOf(forward), viewOf(reversed), 'oneway', false)
    expect(cell.state).toBe('same')
    expect(cell.dependent).toBe(true)
    expect(cell.value).toBe('yes')
  })

  test('a reversed oneway that differs from the mirrored reference is different', () => {
    const forward: Column = { id: 'R', reversed: false, tags: { oneway: 'yes' } }
    const reversed: Column = { id: 'N', reversed: true, tags: { oneway: 'yes' } }
    expect(cellState(viewOf(forward), viewOf(reversed), 'oneway', false).state).toBe('different')
  })

  test('a reversed column with a plain key is not dependent', () => {
    const reversed: Column = { id: 'N', reversed: true, tags: { surface: 'asphalt' } }
    expect(stateOf(reversed, 'surface')).toEqual({
      state: 'same',
      dependent: false,
      value: 'asphalt',
    })
  })

  test('a reversed column that lacks a directional key shows it missing or added in its own keys', () => {
    const reversed: Column = { id: 'N', reversed: true, tags: { 'cycleway:left': 'track' } }
    // stored cycleway:left reads as cycleway:right in chain direction: the reference has cycleway:left
    expect(stateOf(reversed, 'cycleway:left').state).toBe('missing')
    expect(stateOf(reversed, 'cycleway:right').state).toBe('added')
  })
})

import { describe, expect, it } from 'bun:test'
import { MAX_PARTS } from './divide.ts'
import { largestFor, refusalText, stepDivision, stepOfKey, withAxis } from './division.ts'

/** A key event with no modifiers, as the fields the step reads */
function key(fields: { key: string; code?: string; shiftKey?: boolean; ctrlKey?: boolean }) {
  return {
    code: '',
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...fields,
  }
}

describe('withAxis: the numbers stay in range', () => {
  it('sets a whole number on the axis and keeps the other one', () => {
    expect(withAxis({ columns: 2, rows: 1 }, 'columns', 5)).toEqual({ columns: 5, rows: 1 })
    expect(withAxis({ columns: 2, rows: 1 }, 'rows', 3)).toEqual({ columns: 2, rows: 3 })
  })

  it('rounds a fraction down and never goes below one', () => {
    expect(withAxis({ columns: 2, rows: 1 }, 'columns', 3.9)).toEqual({ columns: 3, rows: 1 })
    expect(withAxis({ columns: 2, rows: 1 }, 'columns', 0)).toEqual({ columns: 1, rows: 1 })
    expect(withAxis({ columns: 2, rows: 1 }, 'rows', -4)).toEqual({ columns: 2, rows: 1 })
  })

  it('keeps the total within MAX_PARTS: the other axis limits the largest value', () => {
    expect(largestFor('columns', { columns: 2, rows: 1 })).toBe(MAX_PARTS)
    expect(largestFor('rows', { columns: 4, rows: 1 })).toBe(MAX_PARTS / 4)
    expect(withAxis({ columns: 2, rows: 1 }, 'columns', 500)).toEqual({
      columns: MAX_PARTS,
      rows: 1,
    })
    expect(withAxis({ columns: 4, rows: 1 }, 'rows', 500)).toEqual({ columns: 4, rows: 50 })
  })

  it('leaves the division as it is for a value that is not a number', () => {
    const division = { columns: 2, rows: 1 }
    expect(withAxis(division, 'columns', Number.NaN)).toBe(division)
    expect(withAxis(division, 'rows', Number.POSITIVE_INFINITY)).toBe(division)
  })
})

describe('stepDivision: one key press', () => {
  it('adds or takes away one on the axis, in range', () => {
    expect(stepDivision({ columns: 2, rows: 1 }, 'columns', 1)).toEqual({ columns: 3, rows: 1 })
    expect(stepDivision({ columns: 2, rows: 3 }, 'rows', -1)).toEqual({ columns: 2, rows: 2 })
    expect(stepDivision({ columns: 1, rows: 1 }, 'columns', -1)).toEqual({ columns: 1, rows: 1 })
  })

  it('does nothing past the largest total', () => {
    const full = { columns: 20, rows: 10 }
    expect(stepDivision(full, 'columns', 1)).toEqual(full)
    expect(stepDivision(full, 'rows', 1)).toEqual(full)
  })
})

describe('stepOfKey: which key changes what', () => {
  it('plus adds a column and Shift with it adds a row', () => {
    expect(stepOfKey(key({ key: '+' }))).toEqual({ axis: 'columns', delta: 1 })
    expect(stepOfKey(key({ key: '+', shiftKey: true }))).toEqual({ axis: 'rows', delta: 1 })
  })

  it('minus takes one away, and Shift takes one row away (the underscore on a US keyboard)', () => {
    expect(stepOfKey(key({ key: '-' }))).toEqual({ axis: 'columns', delta: -1 })
    expect(stepOfKey(key({ key: '_', code: 'Minus', shiftKey: true }))).toEqual({
      axis: 'rows',
      delta: -1,
    })
  })

  it('takes the unshifted equals key as plus, and the keypad keys by their code', () => {
    expect(stepOfKey(key({ key: '=' }))).toEqual({ axis: 'columns', delta: 1 })
    expect(stepOfKey(key({ key: 'Add', code: 'NumpadAdd' }))).toEqual({
      axis: 'columns',
      delta: 1,
    })
    expect(stepOfKey(key({ key: 'Subtract', code: 'NumpadSubtract', shiftKey: true }))).toEqual({
      axis: 'rows',
      delta: -1,
    })
  })

  it('asks for nothing with Control, Alt or Meta (the browser zooms with them), or for other keys', () => {
    expect(stepOfKey(key({ key: '+', ctrlKey: true }))).toBeUndefined()
    expect(stepOfKey({ ...key({ key: '-' }), altKey: true })).toBeUndefined()
    expect(stepOfKey({ ...key({ key: '+' }), metaKey: true })).toBeUndefined()
    expect(stepOfKey(key({ key: 'a', code: 'KeyA' }))).toBeUndefined()
    expect(stepOfKey(key({ key: 'Enter', code: 'Enter' }))).toBeUndefined()
  })
})

describe('refusalText: a sentence for each refusal', () => {
  it('gives a text for every refusal, and says the limit for too many parts', () => {
    const reasons = [
      'not_four_corners',
      'concave',
      'in_relation',
      'shared_edge',
      'too_many_parts',
      'nothing_to_do',
    ] as const
    for (const reason of reasons) expect(refusalText(reason).length).toBeGreaterThan(10)
    expect(refusalText('too_many_parts')).toContain(String(MAX_PARTS))
  })
})

import { describe, expect, test } from 'bun:test'
import { stepHighlight, suggestAction } from './suggest.ts'

describe('suggestAction: keys while the list is open', () => {
  const open = { open: true, count: 3, highlighted: -1 }

  test('arrows move the highlight', () => {
    expect(suggestAction('ArrowDown', open)).toBe('next')
    expect(suggestAction('ArrowUp', open)).toBe('previous')
  })

  test('Enter and Tab take only a highlighted item; a quiet list takes nothing', () => {
    expect(suggestAction('Enter', open)).toBeUndefined()
    expect(suggestAction('Tab', open)).toBeUndefined()
    expect(suggestAction('Enter', { ...open, highlighted: 1 })).toBe('take')
    expect(suggestAction('Tab', { ...open, highlighted: 0 })).toBe('take')
  })

  test('Escape closes the list; with the list closed every key is the cell own', () => {
    expect(suggestAction('Escape', open)).toBe('close')
    expect(suggestAction('Escape', { ...open, open: false })).toBeUndefined()
    expect(suggestAction('ArrowDown', { ...open, open: false })).toBeUndefined()
    expect(suggestAction('Enter', { open: true, count: 0, highlighted: -1 })).toBeUndefined()
  })

  test('other keys are the input own', () => {
    expect(suggestAction('a', open)).toBeUndefined()
    expect(suggestAction('ArrowLeft', open)).toBeUndefined()
  })
})

describe('stepHighlight', () => {
  test('down from none is the first, up from none the last; the ends wrap', () => {
    expect(stepHighlight(-1, 1, 3)).toBe(0)
    expect(stepHighlight(-1, -1, 3)).toBe(2)
    expect(stepHighlight(0, 1, 3)).toBe(1)
    expect(stepHighlight(2, 1, 3)).toBe(0)
    expect(stepHighlight(0, -1, 3)).toBe(2)
  })

  test('no items, no highlight', () => {
    expect(stepHighlight(-1, 1, 0)).toBe(-1)
  })
})

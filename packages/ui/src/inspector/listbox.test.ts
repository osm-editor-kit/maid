import { describe, expect, it } from 'bun:test'
import { listboxMove } from './listbox.ts'

describe('listboxMove', () => {
  it('steps down and up one row', () => {
    expect(listboxMove('ArrowDown', 1, 4)).toBe(2)
    expect(listboxMove('ArrowUp', 2, 4)).toBe(1)
  })

  it('wraps at both ends', () => {
    expect(listboxMove('ArrowDown', 3, 4)).toBe(0)
    expect(listboxMove('ArrowUp', 0, 4)).toBe(3)
  })

  it('starts from the first row going down and the last going up when no row is active', () => {
    expect(listboxMove('ArrowDown', -1, 4)).toBe(0)
    expect(listboxMove('ArrowUp', -1, 4)).toBe(3)
  })

  it('goes to the first and the last row with Home and End', () => {
    expect(listboxMove('Home', 2, 4)).toBe(0)
    expect(listboxMove('End', 0, 4)).toBe(3)
  })

  it('has no row to go to in an empty list', () => {
    expect(listboxMove('ArrowDown', -1, 0)).toBe(-1)
    expect(listboxMove('Home', -1, 0)).toBe(-1)
    expect(listboxMove('End', -1, 0)).toBe(-1)
  })

  it('does not move for any other key', () => {
    expect(listboxMove('Enter', 1, 4)).toBeUndefined()
    expect(listboxMove('a', 1, 4)).toBeUndefined()
  })
})

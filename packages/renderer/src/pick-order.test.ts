import { describe, expect, test } from 'bun:test'
import { extentOf, orderPicks, PICK_LIMIT } from './pick-order'

const c = (id: string, priority: number, size = 0) => ({ id, priority, size })

describe('orderPicks', () => {
  test('the picked feature comes first, whatever its size', () => {
    const order = orderPicks([c('w1', 2, 10), c('w2', 2, 500), c('n1', 0)], 'w2')
    expect(order).toEqual(['w2', 'n1', 'w1'])
  })

  test('then by priority: vertex, point, line, area', () => {
    const order = orderPicks([c('a', 3), c('l', 2), c('p', 1), c('v', 0)], null)
    expect(order).toEqual(['v', 'p', 'l', 'a'])
  })

  test('then by size, smaller first, inside one priority', () => {
    const order = orderPicks([c('big', 3, 900), c('small', 3, 10), c('mid', 3, 50)], null)
    expect(order).toEqual(['small', 'mid', 'big'])
  })

  test('ties keep their order', () => {
    expect(orderPicks([c('x', 1, 0), c('y', 1, 0)], null)).toEqual(['x', 'y'])
  })

  test('a picked feature that is not a candidate changes nothing', () => {
    expect(orderPicks([c('x', 1)], 'missing')).toEqual(['x'])
  })

  test('caps the list, but never drops the picked feature', () => {
    const many = Array.from({ length: PICK_LIMIT + 5 }, (_, i) => c(`a${i}`, 3, i))
    expect(orderPicks(many, null)).toHaveLength(PICK_LIMIT)
    const last = `a${PICK_LIMIT + 4}`
    const order = orderPicks(many, last)
    expect(order).toHaveLength(PICK_LIMIT)
    expect(order[0]).toBe(last)
  })
})

describe('extentOf', () => {
  test('a closed outline is measured as an area, in square metres', () => {
    // a 0.001 by 0.001 degree square at the equator: about 111 m a side
    const square: [number, number][] = [
      [0, 0],
      [0.001, 0],
      [0.001, 0.001],
      [0, 0.001],
      [0, 0],
    ]
    const area = extentOf(square, true)
    expect(area).toBeGreaterThan(12_000)
    expect(area).toBeLessThan(12_700)
  })

  test('a line is measured as its length', () => {
    const line: [number, number][] = [
      [0, 0],
      [0, 0.001],
      [0, 0.002],
    ]
    const length = extentOf(line, false)
    expect(length).toBeGreaterThan(221)
    expect(length).toBeLessThan(223)
  })

  test('a bigger square is bigger, and fewer than two points measure nothing', () => {
    const small: [number, number][] = [
      [0, 0],
      [0.001, 0],
      [0.001, 0.001],
      [0, 0.001],
      [0, 0],
    ]
    const big = small.map(([lon, lat]) => [lon * 2, lat * 2] as [number, number])
    expect(extentOf(big, true)).toBeCloseTo(extentOf(small, true) * 4, -1)
    expect(extentOf([[1, 1]], false)).toBe(0)
  })
})

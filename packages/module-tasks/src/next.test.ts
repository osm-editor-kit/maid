import { describe, expect, test } from 'bun:test'
import { nextNearIndex, type TaskShape } from './next.ts'
import type { TaskStatus } from './progress-codec.ts'

// about 70 m per 0.001° of longitude at 52° north
const line = (...points: [number, number][]): TaskShape => ({ points, line: true })
const point = (lon: number, lat: number): TaskShape => ({ points: [[lon, lat]], line: false })
const open = (count: number): TaskStatus[] => Array.from({ length: count }, () => 'open')

describe('nextNearIndex', () => {
  test('takes the line that starts where this one ends, before a nearer one and the file order', () => {
    const shapes = [
      line([13.0, 52.0], [13.001, 52.0]),
      point(13.0, 52.0001), // nearest to the start
      line([13.001, 52.0], [13.002, 52.0]), // follows
    ]
    expect(nextNearIndex(open(3), 0, (i) => shapes[i])).toBe(2)
  })

  test('of several following lines, the straightest', () => {
    const shapes = [
      line([13.0, 52.0], [13.001, 52.0]),
      line([13.001, 52.0], [13.001, 52.001]), // turns left
      line([13.001, 52.0], [13.002, 52.00001]), // straight on
    ]
    expect(nextNearIndex(open(3), 0, (i) => shapes[i])).toBe(2)
  })

  test('without a following line, the nearest open task', () => {
    const shapes = [
      line([13.0, 52.0], [13.001, 52.0]),
      point(13.1, 52.1),
      point(13.0015, 52.0),
      point(13.01, 52.0),
    ]
    expect(nextNearIndex(open(4), 0, (i) => shapes[i])).toBe(2)
  })

  test('a line drawn the other way that touches the end comes before one touching the start', () => {
    const shapes = [
      line([13.001, 52.0], [13.002, 52.0]),
      line([13.001, 52.0], [13.0, 52.0]), // touches the start
      line([13.003, 52.0], [13.002, 52.0]), // touches the end, drawn against
    ]
    expect(nextNearIndex(open(3), 0, (i) => shapes[i])).toBe(2)
  })

  test('skips tasks that are not open', () => {
    const shapes = [
      line([13.0, 52.0], [13.001, 52.0]),
      line([13.001, 52.0], [13.002, 52.0]),
      point(13.01, 52),
    ]
    const statuses: TaskStatus[] = ['open', 'done', 'open']
    expect(nextNearIndex(statuses, 0, (i) => shapes[i])).toBe(2)
  })

  test('falls back to the file order without geometry, and without a current task', () => {
    expect(nextNearIndex(open(3), 1, () => undefined)).toBe(2)
    expect(nextNearIndex(open(3), null, () => point(13, 52))).toBe(0)
    expect(nextNearIndex(['done', 'open'], 1, () => point(13, 52))).toBe(1)
  })
})

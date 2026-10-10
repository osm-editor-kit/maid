import { expect, test } from 'bun:test'
import { median, quantile, summarizeFrames } from './stats'

test('quantiles', () => {
  expect(median([3, 1, 2])).toBe(2)
  expect(quantile([0, 10], 0.95)).toBeCloseTo(9.5)
})

test('frame summary counts stutter and hangs', () => {
  const frames = [...Array(58).fill(16.7), 120, 40]
  const s = summarizeFrames(frames, [120], 1128)
  expect(s.hangs).toBe(1)
  expect(s.medianMs).toBe(16.7)
  expect(s.slowShare).toBeCloseTo(0.106, 2)
  expect(s.longTaskMs).toBe(120)
})

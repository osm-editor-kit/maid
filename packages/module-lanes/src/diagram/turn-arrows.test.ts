import { describe, expect, test } from 'bun:test'
import {
  directionArrowPath,
  glyphTransform,
  TURN_TOKENS,
  turnArrowPaths,
  turnTokens,
} from './turn-arrows.ts'

/** All numbers of a path, in order: x, y pairs for M, L and C */
function numbers(d: string): number[] {
  return [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
}

describe('turnTokens', () => {
  test('splits on ;, trims and drops empty entries', () => {
    expect(turnTokens(' left ; through;;')).toEqual(['left', 'through'])
    expect(turnTokens(undefined)).toEqual([])
    expect(turnTokens('')).toEqual([])
  })
})

describe('turnArrowPaths', () => {
  test('every turn value but none gives one path inside the unit box', () => {
    for (const token of TURN_TOKENS) {
      const { paths, unknown } = turnArrowPaths(token)
      expect(unknown).toEqual([])
      if (token === 'none') {
        expect(paths).toEqual([])
        continue
      }
      expect(paths).toHaveLength(1)
      expect(paths[0]!.token).toBe(token)
      expect(paths[0]!.d.startsWith('M')).toBe(true)
      for (const n of numbers(paths[0]!.d.replaceAll(/A[^L]*?(?=L)/g, ''))) {
        expect(Math.abs(n)).toBeLessThanOrEqual(0.5)
      }
    }
  })

  test('combinations give one path per token, in order, duplicates once', () => {
    const { paths } = turnArrowPaths('left;through;right;left')
    expect(paths.map((p) => p.token)).toEqual(['left', 'through', 'right'])
  })

  test('unknown tokens are reported and not drawn', () => {
    const { paths, unknown } = turnArrowPaths('through;sideways')
    expect(paths.map((p) => p.token)).toEqual(['through'])
    expect(unknown).toEqual(['sideways'])
  })

  test('left bends to negative x, right to positive x, through stays at x 0', () => {
    const tipX = (turn: string) => {
      const d = turnArrowPaths(turn).paths[0]!.d
      // the shaft is the first three points: stem bottom, knee, tip
      const n = numbers(d)
      return n[4]!
    }
    expect(tipX('left')).toBeLessThan(0)
    expect(tipX('slight_left')).toBeLessThan(0)
    expect(tipX('sharp_left')).toBeLessThan(0)
    expect(tipX('right')).toBeGreaterThan(0)
    expect(tipX('slight_right')).toBeGreaterThan(0)
    expect(tipX('sharp_right')).toBeGreaterThan(0)
    // through has no knee: its shaft is stem bottom and tip
    expect(numbers(turnArrowPaths('through').paths[0]!.d)[2]).toBe(0)
  })

  test('slight bends less than a plain turn, sharp points back down', () => {
    const tip = (turn: string) => {
      const n = numbers(turnArrowPaths(turn).paths[0]!.d)
      return { x: n[4]!, y: n[5]! }
    }
    expect(Math.abs(tip('slight_left').x)).toBeLessThan(Math.abs(tip('left').x))
    expect(tip('slight_left').y).toBeLessThan(0)
    expect(tip('sharp_right').y).toBeGreaterThan(0)
  })

  test('mirror images: right is left with x negated', () => {
    const mirror = (d: string) => numbers(d).map((n, i) => (i % 2 === 0 ? -n : n))
    for (const [l, r] of [
      ['left', 'right'],
      ['slight_left', 'slight_right'],
      ['sharp_left', 'sharp_right'],
    ] as const) {
      const left = numbers(turnArrowPaths(l).paths[0]!.d)
      const right = mirror(turnArrowPaths(r).paths[0]!.d)
      expect(right.map((n) => n + 0)).toEqual(left.map((n) => n + 0))
    }
  })

  test('merge_to_left starts right and ends left; merge_to_right the other way', () => {
    const ends = (turn: string) => {
      const n = numbers(turnArrowPaths(turn).paths[0]!.d)
      return { startX: n[0]!, endX: n[12]! }
    }
    expect(ends('merge_to_left').startX).toBeGreaterThan(0)
    expect(ends('merge_to_left').endX).toBeLessThan(0)
    expect(ends('merge_to_right').startX).toBeLessThan(0)
    expect(ends('merge_to_right').endX).toBeGreaterThan(0)
  })

  test('deterministic output', () => {
    expect(turnArrowPaths('left').paths[0]!.d).toBe(
      'M0 0.5L0 0L-0.45 0M-0.277 -0.1L-0.45 0L-0.277 0.1',
    )
    expect(turnArrowPaths('through').paths[0]!.d).toBe(
      'M0 0.5L0 -0.5M-0.1 -0.327L0 -0.5L0.1 -0.327',
    )
  })
})

describe('directionArrowPath', () => {
  test('forward and backward share the straight arrow (the transform turns it), both ways has two heads', () => {
    expect(directionArrowPath('forward')).toBe(turnArrowPaths('through').paths[0]!.d)
    expect(directionArrowPath('backward')).toBe(directionArrowPath('forward'))
    expect(directionArrowPath('both_ways')!.match(/M/g)).toHaveLength(3)
    expect(directionArrowPath('none')).toBeUndefined()
  })
})

describe('glyphTransform', () => {
  test('backward lanes are turned by 180°', () => {
    expect(glyphTransform(10, 20.123456, 12, 'forward')).toBe('translate(10 20.123) scale(12)')
    expect(glyphTransform(10, 20, 12, 'backward')).toBe('translate(10 20) scale(12) rotate(180)')
  })
})

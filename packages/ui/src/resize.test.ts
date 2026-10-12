import { describe, expect, test } from 'bun:test'
import { clampSize } from './useResizable.ts'

describe('clampSize', () => {
  test('keeps a size between the floor and the ceiling', () => {
    expect(clampSize(100, 280, 640)).toBe(280)
    expect(clampSize(320, 280, 640)).toBe(320)
    expect(clampSize(900, 280, 640)).toBe(640)
  })

  test('the ceiling wins when the window is smaller than the floor', () => {
    expect(clampSize(300, 280, 200)).toBe(200)
  })
})

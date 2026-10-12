import { describe, expect, test } from 'bun:test'
import { PALETTE } from './config.ts'
import { colourName, stepIndex, swatchIndex } from './swatch.ts'

describe('swatchIndex', () => {
  test('finds a palette colour regardless of case', () => {
    expect(swatchIndex('#D6007A', PALETTE)).toBe(0)
    expect(swatchIndex('#7c4dff', PALETTE)).toBe(PALETTE.length - 1)
  })

  test('is -1 for a custom colour', () => {
    expect(swatchIndex('#123456', PALETTE)).toBe(-1)
  })
})

describe('stepIndex', () => {
  test('right and down move forward, left and up move back', () => {
    expect(stepIndex(1, 5, 'ArrowRight')).toBe(2)
    expect(stepIndex(1, 5, 'ArrowDown')).toBe(2)
    expect(stepIndex(2, 5, 'ArrowLeft')).toBe(1)
    expect(stepIndex(2, 5, 'ArrowUp')).toBe(1)
  })

  test('wraps around at both ends', () => {
    expect(stepIndex(4, 5, 'ArrowRight')).toBe(0)
    expect(stepIndex(0, 5, 'ArrowLeft')).toBe(4)
    expect(stepIndex(0, 5, 'ArrowUp')).toBe(4)
  })

  test('ignores other keys and an empty list', () => {
    expect(stepIndex(0, 5, 'Enter')).toBeUndefined()
    expect(stepIndex(0, 5, 'a')).toBeUndefined()
    expect(stepIndex(0, 0, 'ArrowRight')).toBeUndefined()
  })
})

describe('colourName', () => {
  test('names the palette colours', () => {
    expect(colourName(PALETTE[0])).toBe('Magenta')
    expect(colourName('#7BC31A')).toBe('Lime')
  })

  test('names any other colour by its hex value', () => {
    expect(colourName('#ABCDEF')).toBe('#abcdef')
  })
})

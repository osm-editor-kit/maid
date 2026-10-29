import { describe, expect, test } from 'bun:test'
import { coveredBottom, shouldDismiss } from './BottomSheet.tsx'

describe('shouldDismiss', () => {
  test('a slow drag closes the sheet only past its distance', () => {
    expect(shouldDismiss(0, 0)).toBe(false)
    expect(shouldDismiss(120, 0)).toBe(false)
    expect(shouldDismiss(121, 0)).toBe(true)
  })

  test('a fast flick closes it even when short', () => {
    expect(shouldDismiss(20, 501)).toBe(true)
    expect(shouldDismiss(20, 500)).toBe(false)
  })

  test('a drag up never closes it', () => {
    expect(shouldDismiss(-200, -800)).toBe(false)
  })
})

describe('coveredBottom', () => {
  test('no keyboard: nothing covered', () => {
    expect(coveredBottom(874, 874, 0)).toBe(0)
  })

  test('a keyboard of 336 px: the bottom 336 px', () => {
    expect(coveredBottom(874, 538, 0)).toBe(336)
  })

  test('the page scrolled inside the visual viewport: what is below it', () => {
    expect(coveredBottom(874, 538, 100)).toBe(236)
  })

  test('never below 0 (a pinch zoom can make the viewport larger than it was)', () => {
    expect(coveredBottom(874, 900, 0)).toBe(0)
  })
})
